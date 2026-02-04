# Kafka Setup

This guide sets up Apache Kafka for event-driven communication between microservices in your online storage system.

## Step 1: Verify Kafka is Running

Ensure Kafka and Zookeeper are running from the infrastructure setup:

```bash
# Check Kafka status
docker compose ps kafka zookeeper

# View Kafka logs
docker compose logs kafka

# Verify Kafka is ready
docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server localhost:9092
```

## Step 2: Create Kafka Topics

The infrastructure setup includes a script to create all necessary topics. Run it now:

```bash
./infrastructure/kafka/topics.sh
```

Or use the Makefile:

```bash
make kafka-topics
```

## Step 3: Verify Topics

List all created topics:

```bash
docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server localhost:9092
```

Expected output:
```
inventory.adjusted
inventory.out_of_stock
inventory.released
inventory.reserved
orders.cancelled
orders.created
orders.paid
orders.payment_required
orders.shipped
orders.updated
payments.failed
payments.initiated
payments.succeeded
payments.webhook_received
events.dlq
```

## Step 4: Go Kafka Module

Create a reusable Go Kafka package for producers and consumers.

### Create `shared/kafka/producer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/IBM/sarama"
	"github.com/google/uuid"
)

// Producer handles publishing messages to Kafka topics
type Producer struct {
	producer sarama.SyncProducer
	config   *ProducerConfig
}

// ProducerConfig holds producer configuration
type ProducerConfig struct {
	Brokers       []string
	ClientID      string
	MaxRetries    int
	RequiredAcks  sarama.RequiredAcks
	Compression   sarama.CompressionCodec
	FlushFrequency int
}

// NewProducer creates a new Kafka producer
func NewProducer(cfg *ProducerConfig) (*Producer, error) {
	config := sarama.NewConfig()
	config.ClientID = cfg.ClientID
	config.Producer.RequiredAcks = cfg.RequiredAcks
	config.Producer.Retry.Max = cfg.MaxRetries
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true
	config.Producer.Compression = cfg.Compression
	config.Producer.Flush.Frequency = cfg.FlushFrequency

	producer, err := sarama.NewSyncProducer(cfg.Brokers, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka producer: %w", err)
	}

	return &Producer{
		producer: producer,
		config:   cfg,
	}, nil
}

// Publish sends a message to a Kafka topic
func (p *Producer) Publish(ctx context.Context, topic string, key string, value interface{}) error {
	// Serialize value to JSON
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Create producer message
	message := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(data),
		Headers: []sarama.RecordHeader{
			{Key: []byte("correlation_id"), Value: []byte(uuid.New().String())},
		},
	}

	// Send message
	partition, offset, err := p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message to topic %s: %w", topic, err)
	}

	log.Printf("Message sent to topic %s [partition %d offset %d]", topic, partition, offset)
	return nil
}

// PublishWithHeaders sends a message with custom headers
func (p *Producer) PublishWithHeaders(ctx context.Context, topic string, key string, value interface{}, headers map[string]string) error {
	// Serialize value to JSON
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Create headers
	recordHeaders := []sarama.RecordHeader{
		{Key: []byte("correlation_id"), Value: []byte(uuid.New().String())},
	}

	for k, v := range headers {
		recordHeaders = append(recordHeaders, sarama.RecordHeader{
			Key:   []byte(k),
			Value: []byte(v),
		})
	}

	// Create producer message
	message := &sarama.ProducerMessage{
		Topic:   topic,
		Key:     sarama.StringEncoder(key),
		Value:   sarama.ByteEncoder(data),
		Headers: recordHeaders,
	}

	// Send message
	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message to topic %s: %w", topic, err)
	}

	return nil
}

// Close closes the producer
func (p *Producer) Close() error {
	return p.producer.Close()
}
```

### Create `shared/kafka/consumer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/IBM/sarama"
)

// ConsumerGroup represents a Kafka consumer group
type ConsumerGroup struct {
	consumer sarama.ConsumerGroup
	handler  ConsumerHandler
	config   *ConsumerConfig
}

// ConsumerConfig holds consumer configuration
type ConsumerConfig struct {
	Brokers         []string
	GroupID         string
	ClientID        string
	InitialOffset   string
	RebalanceStrategy sarama.BalanceStrategy
	SessionTimeout  time.Duration
	HeartbeatTimeout time.Duration
	MaxProcessingTime time.Duration
}

// ConsumerHandler handles consumed messages
type ConsumerHandler interface {
	Setup(sarama.ConsumerGroupSession) error
	Cleanup(sarama.ConsumerGroupSession) error
	ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error
}

// NewConsumerGroup creates a new Kafka consumer group
func NewConsumerGroup(cfg *ConsumerConfig, handler ConsumerHandler) (*ConsumerGroup, error) {
	config := sarama.NewConfig()
	config.ClientID = cfg.ClientID
	config.Consumer.Group.Rebalance.Strategy = cfg.RebalanceStrategy
	config.Consumer.Group.Session.Timeout = cfg.SessionTimeout
	config.Consumer.Group.Heartbeat.Interval = cfg.HeartbeatTimeout
	config.Consumer.MaxProcessingTime = cfg.MaxProcessingTime

	if cfg.InitialOffset == "oldest" {
		config.Consumer.Offsets.Initial = sarama.OffsetOldest
	} else {
		config.Consumer.Offsets.Initial = sarama.OffsetNewest
	}

	consumer, err := sarama.NewConsumerGroup(cfg.Brokers, cfg.GroupID, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka consumer group: %w", err)
	}

	return &ConsumerGroup{
		consumer: consumer,
		handler:  handler,
		config:   cfg,
	}, nil
}

// Consume starts consuming messages from topics
func (cg *ConsumerGroup) Consume(ctx context.Context, topics []string) error {
	wg := &sync.WaitGroup{}
	wg.Add(1)

	go func() {
		defer wg.Done()
		for {
			if err := cg.consumer.Consume(ctx, topics, cg.handler); err != nil {
				log.Printf("Consumer error: %v", err)
			}

			// Check if context was cancelled
			if ctx.Err() != nil {
				return
			}
		}
	}()

	// Wait for interrupt signal
	sigterm := make(chan os.Signal, 1)
	signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)

	<-sigterm
	log.Println("Terminating consumer...")

	cg.Close()
	wg.Wait()

	return nil
}

// Close closes the consumer group
func (cg *ConsumerGroup) Close() error {
	return cg.consumer.Close()
}
```

### Create `shared/kafka/message.go`:

```go
package kafka

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Message represents a generic Kafka message
type Message struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Source    string                 `json:"source"`
	Timestamp time.Time              `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
	Metadata  map[string]string      `json:"metadata,omitempty"`
}

// NewMessage creates a new Kafka message
func NewMessage(messageType, source string, data map[string]interface{}) *Message {
	return &Message{
		ID:        uuid.New().String(),
		Type:      messageType,
		Source:    source,
		Timestamp: time.Now().UTC(),
		Data:      data,
		Metadata:  make(map[string]string),
	}
}

// ToJSON converts the message to JSON bytes
func (m *Message) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

// ============================================================================

// OrderCreatedEvent represents an order creation event
type OrderCreatedEvent struct {
	OrderID     string `json:"order_id"`
	UserID      string `json:"user_id"`
	Total       string `json:"total"`
	Currency    string `json:"currency"`
	ItemsCount  int    `json:"items_count"`
	Items       []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
		Price     string `json:"price"`
	} `json:"items"`
}

// OrderPaidEvent represents an order payment success event
type OrderPaidEvent struct {
	OrderID      string `json:"order_id"`
	UserID       string `json:"user_id"`
	Amount       string `json:"amount"`
	Currency     string `json:"currency"`
	PaymentID    string `json:"payment_id"`
	PaymentDate  string `json:"payment_date"`
}

// OrderCancelledEvent represents an order cancellation event
type OrderCancelledEvent struct {
	OrderID     string `json:"order_id"`
	UserID      string `json:"user_id"`
	Reason      string `json:"reason,omitempty"`
	CancelledAt string `json:"cancelled_at"`
}

// ============================================================================

// PaymentInitiatedEvent represents a payment initiation event
type PaymentInitiatedEvent struct {
	PaymentID string `json:"payment_id"`
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Method    string `json:"method"`
}

// PaymentSucceededEvent represents a payment success event
type PaymentSucceededEvent struct {
	PaymentID      string `json:"payment_id"`
	OrderID        string `json:"order_id"`
	UserID         string `json:"user_id"`
	Amount         string `json:"amount"`
	Currency       string `json:"currency"`
	PaymentDate    string `json:"payment_date"`
	PaymentMethod  string `json:"payment_method"`
	ProviderID     string `json:"provider_id"`
}

// PaymentFailedEvent represents a payment failure event
type PaymentFailedEvent struct {
	PaymentID string `json:"payment_id"`
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Reason    string `json:"reason"`
	Code      string `json:"code"`
}

// ============================================================================

// InventoryReservedEvent represents inventory reservation event
type InventoryReservedEvent struct {
	ReservationID string `json:"reservation_id"`
	OrderID       string `json:"order_id"`
	Items         []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ReservedAt string `json:"reserved_at"`
}

// InventoryReleasedEvent represents inventory release event
type InventoryReleasedEvent struct {
	ReservationID string `json:"reservation_id"`
	OrderID       string `json:"order_id"`
	Items         []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ReleasedAt string `json:"released_at"`
}

// InventoryOutOfStockEvent represents an out of stock event
type InventoryOutOfStockEvent struct {
	OrderID      string `json:"order_id"`
	ProductID    string `json:"product_id"`
	RequestedQty int    `json:"requested_qty"`
	AvailableQty int    `json:"available_qty"`
	Timestamp    string `json:"timestamp"`
}

// InventoryAdjustedEvent represents inventory adjustment event
type InventoryAdjustedEvent struct {
	ProductID      string `json:"product_id"`
	AdjustmentType string `json:"adjustment_type"`
	Quantity       int    `json:"quantity"`
	Reason         string `json:"reason,omitempty"`
	ReferenceID    string `json:"reference_id,omitempty"`
	Timestamp      string `json:"timestamp"`
}
```

### Create `shared/kafka/consumer_group_handler.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"log"

	"github.com/IBM/sarama"
)

// DefaultConsumerHandler provides a default implementation of ConsumerHandler
type DefaultConsumerHandler struct {
	Processor func(topic string, message []byte) error
}

// Setup is called at the beginning of a new session
func (h *DefaultConsumerHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

// Cleanup is called at the end of a session
func (h *DefaultConsumerHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// ConsumeClaim processes messages from a claim
func (h *DefaultConsumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		log.Printf("Consumed message topic=%s partition=%d offset=%d key=%s",
			message.Topic, message.Partition, message.Offset, string(message.Key))

		if err := h.Processor(message.Topic, message.Value); err != nil {
			log.Printf("Error processing message: %v", err)
			// Continue processing other messages
		} else {
			// Mark message as processed only if successful
			session.MarkMessage(message, "")
		}
	}
	return nil
}

// MessageProcessor is a function that processes Kafka messages
type MessageProcessor func(ctx context.Context, topic string, message *Message) error

// TypedConsumerHandler provides a type-safe consumer handler
type TypedConsumerHandler struct {
	Processor MessageProcessor
}

// Setup is called at the beginning of a new session
func (h *TypedConsumerHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

// Cleanup is called at the end of a session
func (h *TypedConsumerHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// ConsumeClaim processes messages from a claim
func (h *TypedConsumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		ctx := context.Background()

		// Parse message
		var msg Message
		if err := json.Unmarshal(message.Value, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// Process message
		if err := h.Processor(ctx, message.Topic, &msg); err != nil {
			log.Printf("Error processing message: %v", err)
		} else {
			session.MarkMessage(message, "")
		}
	}
	return nil
}

// ============================================================================

// DeadLetterQueueProducer sends failed messages to DLQ
type DeadLetterQueueProducer struct {
	producer *Producer
	dlqTopic string
}

// NewDeadLetterQueueProducer creates a new DLQ producer
func NewDeadLetterQueueProducer(producer *Producer, dlqTopic string) *DeadLetterQueueProducer {
	return &DeadLetterQueueProducer{
		producer: producer,
		dlqTopic: dlqTopic,
	}
}

// SendToDLQ sends a failed message to the dead letter queue
func (dlq *DeadLetterQueueProducer) SendToDLQ(ctx context.Context, originalTopic string, originalMessage []byte, err error) error {
	dlqMessage := map[string]interface{}{
		"original_topic":   originalTopic,
		"original_message": string(originalMessage),
		"error":            err.Error(),
		"timestamp":        time.Now().UTC(),
	}

	return dlq.producer.Publish(ctx, dlq.dlqTopic, originalTopic, dlqMessage)
}
```

### Create `shared/kafka/events.go`:

```go
package kafka

import (
	"context"
	"fmt"
	"log"
)

// EventPublisher provides methods to publish domain events
type EventPublisher struct {
	producer *Producer
	source   string
}

// NewEventPublisher creates a new event publisher
func NewEventPublisher(producer *Producer, source string) *EventPublisher {
	return &EventPublisher{
		producer: producer,
		source:   source,
	}
}

// PublishOrderCreated publishes an order creation event
func (p *EventPublisher) PublishOrderCreated(ctx context.Context, event *OrderCreatedEvent) error {
	headers := map[string]string{
		"event_type": "order.created",
		"order_id":   event.OrderID,
		"user_id":    event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "orders.created", event.OrderID, event, headers)
}

// PublishOrderPaid publishes an order payment event
func (p *EventPublisher) PublishOrderPaid(ctx context.Context, event *OrderPaidEvent) error {
	headers := map[string]string{
		"event_type": "order.paid",
		"order_id":   event.OrderID,
		"user_id":    event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "orders.paid", event.OrderID, event, headers)
}

// PublishOrderCancelled publishes an order cancellation event
func (p *EventPublisher) PublishOrderCancelled(ctx context.Context, event *OrderCancelledEvent) error {
	headers := map[string]string{
		"event_type": "order.cancelled",
		"order_id":   event.OrderID,
		"user_id":    event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "orders.cancelled", event.OrderID, event, headers)
}

// PublishPaymentInitiated publishes a payment initiation event
func (p *EventPublisher) PublishPaymentInitiated(ctx context.Context, event *PaymentInitiatedEvent) error {
	headers := map[string]string{
		"event_type":  "payment.initiated",
		"payment_id":  event.PaymentID,
		"order_id":    event.OrderID,
		"user_id":     event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "payments.initiated", event.PaymentID, event, headers)
}

// PublishPaymentSucceeded publishes a payment success event
func (p *EventPublisher) PublishPaymentSucceeded(ctx context.Context, event *PaymentSucceededEvent) error {
	headers := map[string]string{
		"event_type":  "payment.succeeded",
		"payment_id":  event.PaymentID,
		"order_id":    event.OrderID,
		"user_id":     event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "payments.succeeded", event.PaymentID, event, headers)
}

// PublishPaymentFailed publishes a payment failure event
func (p *EventPublisher) PublishPaymentFailed(ctx context.Context, event *PaymentFailedEvent) error {
	headers := map[string]string{
		"event_type":  "payment.failed",
		"payment_id":  event.PaymentID,
		"order_id":    event.OrderID,
		"user_id":     event.UserID,
	}

	return p.producer.PublishWithHeaders(ctx, "payments.failed", event.PaymentID, event, headers)
}

// PublishInventoryReserved publishes an inventory reservation event
func (p *EventPublisher) PublishInventoryReserved(ctx context.Context, event *InventoryReservedEvent) error {
	headers := map[string]string{
		"event_type":     "inventory.reserved",
		"reservation_id": event.ReservationID,
		"order_id":       event.OrderID,
	}

	return p.producer.PublishWithHeaders(ctx, "inventory.reserved", event.ReservationID, event, headers)
}

// PublishInventoryReleased publishes an inventory release event
func (p *EventPublisher) PublishInventoryReleased(ctx context.Context, event *InventoryReleasedEvent) error {
	headers := map[string]string{
		"event_type":     "inventory.released",
		"reservation_id": event.ReservationID,
		"order_id":       event.OrderID,
	}

	return p.producer.PublishWithHeaders(ctx, "inventory.released", event.ReservationID, event, headers)
}

// PublishInventoryOutOfStock publishes an out of stock event
func (p *EventPublisher) PublishInventoryOutOfStock(ctx context.Context, event *InventoryOutOfStockEvent) error {
	headers := map[string]string{
		"event_type":  "inventory.out_of_stock",
		"order_id":    event.OrderID,
		"product_id":  event.ProductID,
	}

	return p.producer.PublishWithHeaders(ctx, "inventory.out_of_stock", event.OrderID, event, headers)
}

// PublishInventoryAdjusted publishes an inventory adjustment event
func (p *EventPublisher) PublishInventoryAdjusted(ctx context.Context, event *InventoryAdjustedEvent) error {
	headers := map[string]string{
		"event_type": "inventory.adjusted",
		"product_id": event.ProductID,
	}

	return p.producer.PublishWithHeaders(ctx, "inventory.adjusted", event.ProductID, event, headers)
}
```

## Step 5: Example Consumer Implementation

Create an example consumer to demonstrate how to use the Kafka module.

### Create `shared/kafka/example_consumer.go`:

```go
package kafka_test

import (
	"context"
	"fmt"
	"log"

	"github.com/IBM/sarama"
)

// ExampleOrderServiceConsumer demonstrates consuming order events
type ExampleOrderServiceConsumer struct {
}

// Setup is called when a new session starts
func (c *ExampleOrderServiceConsumer) Setup(session sarama.ConsumerGroupSession) error {
	log.Println("Order service consumer session started")
	return nil
}

// Cleanup is called when a session ends
func (c *ExampleOrderServiceConsumer) Cleanup(session sarama.ConsumerGroupSession) error {
	log.Println("Order service consumer session ended")
	return nil
}

// ConsumeClaim processes messages from the topic
func (c *ExampleOrderServiceConsumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		log.Printf("Received message on topic %s: %s", message.Topic, string(message.Value))

		// Process message based on topic
		switch message.Topic {
		case "orders.created":
			c.handleOrderCreated(message.Value)
		case "orders.paid":
			c.handleOrderPaid(message.Value)
		case "orders.cancelled":
			c.handleOrderCancelled(message.Value)
		}

		// Mark message as processed
		session.MarkMessage(message, "")
	}
	return nil
}

func (c *ExampleOrderServiceConsumer) handleOrderCreated(data []byte) {
	// Parse and handle order created event
	log.Printf("Handling order created: %s", string(data))
	// Business logic here...
}

func (c *ExampleOrderServiceConsumer) handleOrderPaid(data []byte) {
	// Parse and handle order paid event
	log.Printf("Handling order paid: %s", string(data))
	// Business logic here...
}

func (c *ExampleOrderServiceConsumer) handleOrderCancelled(data []byte) {
	// Parse and handle order cancelled event
	log.Printf("Handling order cancelled: %s", string(data))
	// Business logic here...
}

// Example usage in a service main function:
/*
func main() {
	cfg := &kafka.ConsumerConfig{
		Brokers:          []string{"localhost:9092"},
		GroupID:          "order-service",
		ClientID:         "order-service-consumer",
		InitialOffset:    "newest",
		SessionTimeout:   10 * time.Second,
		HeartbeatTimeout: 3 * time.Second,
	}

	handler := &ExampleOrderServiceConsumer{}

	consumer, err := kafka.NewConsumerGroup(cfg, handler)
	if err != nil {
		log.Fatalf("Failed to create consumer: %v", err)
	}

	topics := []string{"orders.created", "orders.paid", "orders.cancelled"}
	if err := consumer.Consume(context.Background(), topics); err != nil {
		log.Fatalf("Failed to consume: %v", err)
	}
}
*/
```

## Step 6: Testing Kafka

Create test utilities to verify Kafka is working correctly.

### Create `scripts/kafka-test-producer.sh`:

```bash
#!/bin/bash

# Simple test producer
# Usage: ./scripts/kafka-test-producer.sh <topic> <message>

set -e

TOPIC="${1:-test-topic}"
MESSAGE="${2:-Hello Kafka!}"

echo "Sending message to topic: $TOPIC"
echo "Message: $MESSAGE"

docker exec -i online-storage-kafka kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic "$TOPIC" \
  --property "parse.key=true" \
  --property "key.separator=:" <<< "test-key:$MESSAGE"

echo "Message sent!"
```

### Create `scripts/kafka-test-consumer.sh`:

```bash
#!/bin/bash

# Simple test consumer
# Usage: ./scripts/kafka-test-consumer.sh <topic>

set -e

TOPIC="${1:-test-topic}"

echo "Consuming messages from topic: $TOPIC"
echo "Press Ctrl+C to stop..."

docker exec -it online-storage-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic "$TOPIC" \
  --from-beginning
```

Make scripts executable:

```bash
chmod +x scripts/kafka-test-producer.sh
chmod +x scripts/kafka-test-consumer.sh
```

## Step 7: Verify Kafka Setup

Test the Kafka installation:

```bash
# Test producing and consuming messages
./scripts/kafka-test-producer.sh "test-topic" "Hello from Kafka!"

# In another terminal, consume the message
./scripts/kafka-test-consumer.sh "test-topic"

# View consumer groups
docker exec -it online-storage-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --list

# Describe consumer group
docker exec -it online-storage-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group test-group

# List topics
docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server localhost:9092

# Describe a topic
docker exec -it online-storage-kafka kafka-topics \
  --describe \
  --bootstrap-server localhost:9092 \
  --topic orders.created
```

## Step 8: Kafka Configuration Options

The following environment variables control Kafka behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | `kafka:9092` | Comma-separated list of Kafka brokers |
| `KAFKA_CLIENT_ID` | `service-name` | Client ID for Kafka connections |
| `KAFKA_GROUP_ID` | `service-group` | Consumer group ID |
| `KAFKA_TIMEOUT` | `10s` | Kafka operation timeout |
| `KAFKA_RETRIES` | `3` | Number of retry attempts |

## Step 9: Update Makefile

Add Kafka-related targets to the Makefile:

```makefile
# Kafka targets
kafka-topics:
	./infrastructure/kafka/topics.sh

kafka-list-topics:
	docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server localhost:9092

kafka-consumer-groups:
	docker exec -it online-storage-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --list

kafka-logs:
	docker compose logs -f kafka

# Kafka UI
kafka-ui:
	@echo "Kafka UI available at http://localhost:8081"
```

## Next Steps

With Kafka set up, continue to the next implementation guide: [04-nginx-gateway.md](./04-nginx-gateway.md)

## Troubleshooting

### Topics not created
- Verify Kafka is running: `docker compose ps kafka`
- Run the topics script: `make kafka-topics`
- Check Kafka logs: `docker compose logs kafka`

### Consumer not receiving messages
- Check consumer group offset: `docker exec -it online-storage-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group <group-id>`
- Verify topic has partitions: `docker exec -it online-storage-kafka kafka-topics --describe --bootstrap-server localhost:9092 --topic <topic>`
- Check consumer logs for errors

### Connection refused
- Verify Kafka broker addresses
- Check Docker network connectivity
- Review environment variables for `KAFKA_BROKERS`

### High consumer lag
- Monitor consumer lag: `docker exec -it online-storage-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group <group-id>`
- Increase consumer group size
- Optimize message processing logic

### Message processing errors
- Check DLQ (dead letter queue) for failed messages
- Review application logs for error details
- Validate message schema
