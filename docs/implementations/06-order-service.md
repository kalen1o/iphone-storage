# Order Service Implementation

This guide implements the Order service, which handles order lifecycle management, consumes order-related events from Kafka, and publishes order status updates.

## Step 1: Initialize Go Module

Create and initialize Order service:

```bash
cd services/order-service

# Initialize Go module
go mod init github.com/yourusername/online-storage/order-service

# Add dependencies
go get github.com/IBM/sarama
go get github.com/jackc/pgx/v5
go get github.com/google/uuid
```

## Step 2: Project Structure

Create directory structure:

```bash
cd services/order-service

mkdir -p cmd/order
mkdir -p internal/order
mkdir -p internal/kafka
mkdir -p internal/db
mkdir -p pkg/models
```

## Step 3: Dockerfile

Create Dockerfile for Order service.

### Create `services/order-service/Dockerfile`:

```dockerfile
# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build application
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/order ./cmd/order

# Runtime stage
FROM alpine:3.18

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/bin/order /app/order

# Set timezone
ENV TZ=UTC

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8081/health || exit 1

# Run application
CMD ["/app/order"]
```

### Create `services/order-service/.dockerignore`:

```
*.md
.git
.gitignore
.env
.env.*
node_modules
frontend
infrastructure
docs
.vscode
.idea
```

## Step 4: Order Business Logic

Create order business logic module.

### Create `services/order-service/internal/order/order.go`:

```go
package order

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"yourusername/online-storage/order-service/pkg/models"
)

// Service handles order business logic
type Service struct {
	dbRepo Repository
	publisher EventPublisher
}

// Repository defines database operations for orders
type Repository interface {
	GetOrderByID(ctx context.Context, orderID string) (*models.Order, error)
	UpdateOrderStatus(ctx context.Context, orderID string, status string) error
	GetOrdersByStatus(ctx context.Context, status string, limit, offset int) ([]models.Order, error)
	UpdateOrder(ctx context.Context, order *models.Order) error
}

// EventPublisher defines event publishing interface
type EventPublisher interface {
	PublishOrderPaid(ctx context.Context, event *models.OrderPaidEvent) error
	PublishOrderCancelled(ctx context.Context, event *models.OrderCancelledEvent) error
	PublishOrderShipped(ctx context.Context, event *models.OrderShippedEvent) error
}

// NewService creates a new order service
func NewService(repo Repository, publisher EventPublisher) *Service {
	return &Service{
		dbRepo:   repo,
		publisher: publisher,
	}
}

// HandleOrderCreated handles an order creation event
func (s *Service) HandleOrderCreated(ctx context.Context, orderID string, userID string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Verify order is in correct status
	if order.Status != "payment_required" {
		return fmt.Errorf("order is not in payment_required status, current status: %s", order.Status)
	}

	// Order is created, waiting for payment
	// This event is consumed to acknowledge order creation
	fmt.Printf("Order %s created, waiting for payment\n", orderID)

	return nil
}

// HandlePaymentSucceeded handles a successful payment event
func (s *Service) HandlePaymentSucceeded(ctx context.Context, paymentID, orderID string, amount float64) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Verify order is in correct status
	if order.Status != "payment_required" {
		return fmt.Errorf("order is not in payment_required status, current status: %s", order.Status)
	}

	// Update order status to paid
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "paid"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Publish order.paid event
	event := &models.OrderPaidEvent{
		OrderID:     orderID,
		UserID:      order.UserID.String(),
		Amount:      fmt.Sprintf("%.2f", amount),
		Currency:    order.Currency,
		PaymentID:   paymentID,
		PaymentDate: time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishOrderPaid(ctx, event); err != nil {
		return fmt.Errorf("failed to publish order.paid event: %w", err)
	}

	fmt.Printf("Order %s marked as paid\n", orderID)
	return nil
}

// HandlePaymentFailed handles a failed payment event
func (s *Service) HandlePaymentFailed(ctx context.Context, paymentID, orderID string, reason string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Update order status to payment_failed
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "payment_failed"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Optionally, publish order.cancelled event if payment failure is final
	// For now, we'll let customer retry payment

	fmt.Printf("Payment failed for order %s: %s\n", orderID, reason)
	return nil
}

// HandleInventoryReserved handles inventory reservation event
func (s *Service) HandleInventoryReserved(ctx context.Context, orderID string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Verify order is in correct status
	if order.Status != "paid" && order.Status != "processing" {
		return fmt.Errorf("order is not in paid or processing status, current status: %s", order.Status)
	}

	// Update order status to processing
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "processing"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	fmt.Printf("Order %s is now processing (inventory reserved)\n", orderID)
	return nil
}

// HandleInventoryOutOfStock handles out of stock event
func (s *Service) HandleInventoryOutOfStock(ctx context.Context, orderID, productID string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Update order status to cancelled
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "cancelled"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Publish order.cancelled event
	event := &models.OrderCancelledEvent{
		OrderID:     orderID,
		UserID:      order.UserID.String(),
		Reason:       "Out of stock for product: " + productID,
		CancelledAt: time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishOrderCancelled(ctx, event); err != nil {
		return fmt.Errorf("failed to publish order.cancelled event: %w", err)
	}

	fmt.Printf("Order %s cancelled due to out of stock\n", orderID)
	return nil
}

// ShipOrder ships an order (manual or scheduled)
func (s *Service) ShipOrder(ctx context.Context, orderID string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Verify order is in correct status
	if order.Status != "processing" {
		return fmt.Errorf("order is not in processing status, current status: %s", order.Status)
	}

	// Update order status to shipped
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "shipped"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Publish order.shipped event
	event := &models.OrderShippedEvent{
		OrderID:   orderID,
		UserID:    order.UserID.String(),
		ShippedAt: time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishOrderShipped(ctx, event); err != nil {
		return fmt.Errorf("failed to publish order.shipped event: %w", err)
	}

	fmt.Printf("Order %s has been shipped\n", orderID)
	return nil
}

// CancelOrder cancels an order
func (s *Service) CancelOrder(ctx context.Context, orderID, reason string) error {
	// Get order from database
	order, err := s.dbRepo.GetOrderByID(ctx, orderID)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Check if order can be cancelled
	if order.Status == "shipped" || order.Status == "delivered" {
		return fmt.Errorf("cannot cancel order in %s status", order.Status)
	}

	// Update order status to cancelled
	if err := s.dbRepo.UpdateOrderStatus(ctx, orderID, "cancelled"); err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Publish order.cancelled event
	event := &models.OrderCancelledEvent{
		OrderID:     orderID,
		UserID:      order.UserID.String(),
		Reason:       reason,
		CancelledAt: time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishOrderCancelled(ctx, event); err != nil {
		return fmt.Errorf("failed to publish order.cancelled event: %w", err)
	}

	fmt.Printf("Order %s has been cancelled: %s\n", orderID, reason)
	return nil
}

// GetPendingOrders retrieves all pending orders for processing
func (s *Service) GetPendingOrders(ctx context.Context, limit int) ([]models.Order, error) {
	return s.dbRepo.GetOrdersByStatus(ctx, "processing", limit, 0)
}
```

## Step 5: Database Repository

Create database repository for Order service.

### Create `services/order-service/internal/db/repository.go`:

```go
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"yourusername/online-storage/order-service/pkg/models"
)

// Repository implements order repository interface
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new order repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetOrderByID retrieves an order by ID
func (r *Repository) GetOrderByID(ctx context.Context, orderID string) (*models.Order, error) {
	var order models.Order

	query := `
		SELECT id, user_id, status, subtotal, tax, total, currency,
		       customer_notes, metadata, created_at, updated_at
		FROM orders
		WHERE id = $1 AND deleted_at IS NULL
	`
	err := r.pool.QueryRow(ctx, query, orderID).Scan(
		&order.ID, &order.UserID, &order.Status, &order.Subtotal, &order.Tax,
		&order.Total, &order.Currency, &order.CustomerNotes, &order.Metadata,
		&order.CreatedAt, &order.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	return &order, nil
}

// UpdateOrderStatus updates the status of an order
func (r *Repository) UpdateOrderStatus(ctx context.Context, orderID string, status string) error {
	query := `
		UPDATE orders
		SET status = $1, updated_at = NOW()
		WHERE id = $2
	`
	result, err := r.pool.Exec(ctx, query, status, orderID)
	if err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("order not found: %s", orderID)
	}

	return nil
}

// UpdateOrder updates an order
func (r *Repository) UpdateOrder(ctx context.Context, order *models.Order) error {
	query := `
		UPDATE orders
		SET status = $1, customer_notes = $2, metadata = $3, updated_at = NOW()
		WHERE id = $4
	`
	result, err := r.pool.Exec(ctx, query, order.Status, order.CustomerNotes, order.Metadata, order.ID)
	if err != nil {
		return fmt.Errorf("failed to update order: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("order not found: %s", order.ID)
	}

	return nil
}

// GetOrdersByStatus retrieves orders by status
func (r *Repository) GetOrdersByStatus(ctx context.Context, status string, limit, offset int) ([]models.Order, error) {
	query := `
		SELECT id, user_id, status, subtotal, tax, total, currency,
		       customer_notes, metadata, created_at, updated_at
		FROM orders
		WHERE status = $1 AND deleted_at IS NULL
		ORDER BY created_at ASC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.pool.Query(ctx, query, status, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get orders: %w", err)
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		err := rows.Scan(
			&order.ID, &order.UserID, &order.Status, &order.Subtotal, &order.Tax,
			&order.Total, &order.Currency, &order.CustomerNotes, &order.Metadata,
			&order.CreatedAt, &order.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}
		orders = append(orders, order)
	}

	return orders, nil
}

// CreateOrder creates a new order (used for testing/recovery)
func (r *Repository) CreateOrder(ctx context.Context, order *models.Order) error {
	query := `
		INSERT INTO orders (id, user_id, status, subtotal, tax, total, currency, customer_notes, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at, updated_at
	`
	err := r.pool.QueryRow(
		ctx,
		query,
		order.ID, order.UserID, order.Status, order.Subtotal, order.Tax,
		order.Total, order.Currency, order.CustomerNotes, order.Metadata,
	).Scan(&order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create order: %w", err)
	}

	return nil
}
```

## Step 6: Kafka Consumer

Create Kafka consumer for order events.

### Create `services/order-service/internal/kafka/consumer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/IBM/sarama"
	"yourusername/online-storage/order-service/internal/order"
	"yourusername/online-storage/order-service/pkg/models"
)

// Consumer handles order-related Kafka events
type Consumer struct {
	orderService *order.Service
}

// NewConsumer creates a new order event consumer
func NewConsumer(orderService *order.Service) *Consumer {
	return &Consumer{
		orderService: orderService,
	}
}

// Handler implements sarama.ConsumerGroupHandler
func (c *Consumer) Handler() sarama.ConsumerGroupHandler {
	return c
}

// Setup is called at the beginning of a new session
func (c *Consumer) Setup(session sarama.ConsumerGroupSession) error {
	log.Println("Order service consumer session started")
	return nil
}

// Cleanup is called at the end of a session
func (c *Consumer) Cleanup(session sarama.ConsumerGroupSession) error {
	log.Println("Order service consumer session ended")
	return nil
}

// ConsumeClaim processes messages from a claim
func (c *Consumer) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	ctx := context.Background()

	for message := range claim.Messages() {
		log.Printf("Received message on topic %s: %s", message.Topic, string(message.Value))

		// Process message based on topic
		var err error
		switch message.Topic {
		case "orders.created":
			err = c.handleOrderCreated(ctx, message.Value)
		case "payments.succeeded":
			err = c.handlePaymentSucceeded(ctx, message.Value)
		case "payments.failed":
			err = c.handlePaymentFailed(ctx, message.Value)
		case "inventory.reserved":
			err = c.handleInventoryReserved(ctx, message.Value)
		case "inventory.out_of_stock":
			err = c.handleInventoryOutOfStock(ctx, message.Value)
		default:
			log.Printf("Unknown topic: %s", message.Topic)
		}

		if err != nil {
			log.Printf("Error processing message: %v", err)
			// Don't mark message as processed, allow retry
		} else {
			session.MarkMessage(message, "")
		}
	}
	return nil
}

func (c *Consumer) handleOrderCreated(ctx context.Context, data []byte) error {
	var event models.OrderCreatedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal order.created event: %w", err)
	}

	return c.orderService.HandleOrderCreated(ctx, event.OrderID, event.UserID)
}

func (c *Consumer) handlePaymentSucceeded(ctx context.Context, data []byte) error {
	var event models.PaymentSucceededEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal payments.succeeded event: %w", err)
	}

	// Parse amount as float64
	var amount float64
	if _, err := fmt.Sscanf(event.Amount, "%f", &amount); err != nil {
		return fmt.Errorf("failed to parse amount: %w", err)
	}

	return c.orderService.HandlePaymentSucceeded(ctx, event.PaymentID, event.OrderID, amount)
}

func (c *Consumer) handlePaymentFailed(ctx context.Context, data []byte) error {
	var event models.PaymentFailedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal payments.failed event: %w", err)
	}

	return c.orderService.HandlePaymentFailed(ctx, event.PaymentID, event.OrderID, event.Reason)
}

func (c *Consumer) handleInventoryReserved(ctx context.Context, data []byte) error {
	var event models.InventoryReservedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal inventory.reserved event: %w", err)
	}

	return c.orderService.HandleInventoryReserved(ctx, event.OrderID)
}

func (c *Consumer) handleInventoryOutOfStock(ctx context.Context, data []byte) error {
	var event models.InventoryOutOfStockEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal inventory.out_of_stock event: %w", err)
	}

	return c.orderService.HandleInventoryOutOfStock(ctx, event.OrderID, event.ProductID)
}
```

## Step 7: Kafka Producer

Create Kafka producer for publishing order events.

### Create `services/order-service/internal/kafka/producer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/IBM/sarama"
	"yourusername/online-storage/order-service/pkg/models"
)

// Producer handles publishing order events to Kafka
type Producer struct {
	producer sarama.SyncProducer
}

// NewProducer creates a new Kafka producer
func NewProducer(brokers []string, clientID string) (*Producer, error) {
	config := sarama.NewConfig()
	config.ClientID = clientID
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 3
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true

	producer, err := sarama.NewSyncProducer(brokers, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka producer: %w", err)
	}

	return &Producer{producer: producer}, nil
}

// PublishOrderPaid publishes an order paid event
func (p *Producer) PublishOrderPaid(ctx context.Context, event *models.OrderPaidEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "orders.paid",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published orders.paid event for order %s\n", event.OrderID)
	return nil
}

// PublishOrderCancelled publishes an order cancelled event
func (p *Producer) PublishOrderCancelled(ctx context.Context, event *models.OrderCancelledEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "orders.cancelled",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published orders.cancelled event for order %s\n", event.OrderID)
	return nil
}

// PublishOrderShipped publishes an order shipped event
func (p *Producer) PublishOrderShipped(ctx context.Context, event *models.OrderShippedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "orders.shipped",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published orders.shipped event for order %s\n", event.OrderID)
	return nil
}

// Close closes the producer
func (p *Producer) Close() error {
	return p.producer.Close()
}
```

## Step 8: Models

Create models for Order service.

### Create `services/order-service/pkg/models/order.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Order represents an order
type Order struct {
	ID            uuid.UUID              `json:"id"`
	UserID        uuid.UUID              `json:"user_id"`
	Status        string                 `json:"status"`
	Subtotal      float64                `json:"subtotal"`
	Tax           float64                `json:"tax"`
	Total         float64                `json:"total"`
	Currency      string                 `json:"currency"`
	CustomerNotes string                 `json:"customer_notes,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt     time.Time              `json:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at"`
}

// Event Models
type OrderCreatedEvent struct {
	OrderID    string `json:"order_id"`
	UserID     string `json:"user_id"`
	Total      string `json:"total"`
	Currency   string `json:"currency"`
	ItemsCount int    `json:"items_count"`
	Items      []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
		Price     string `json:"price"`
	} `json:"items"`
}

type OrderPaidEvent struct {
	OrderID     string `json:"order_id"`
	UserID      string `json:"user_id"`
	Amount      string `json:"amount"`
	Currency    string `json:"currency"`
	PaymentID   string `json:"payment_id"`
	PaymentDate string `json:"payment_date"`
}

type OrderCancelledEvent struct {
	OrderID     string `json:"order_id"`
	UserID      string `json:"user_id"`
	Reason      string `json:"reason,omitempty"`
	CancelledAt string `json:"cancelled_at"`
}

type OrderShippedEvent struct {
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id"`
	ShippedAt string `json:"shipped_at"`
}

// Payment Events (consumed)
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

type PaymentFailedEvent struct {
	PaymentID string `json:"payment_id"`
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Reason    string `json:"reason"`
	Code      string `json:"code"`
}

// Inventory Events (consumed)
type InventoryReservedEvent struct {
	ReservationID string `json:"reservation_id"`
	OrderID       string `json:"order_id"`
	Items         []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ReservedAt string `json:"reserved_at"`
}

type InventoryOutOfStockEvent struct {
	OrderID      string `json:"order_id"`
	ProductID    string `json:"product_id"`
	RequestedQty int    `json:"requested_qty"`
	AvailableQty int    `json:"available_qty"`
	Timestamp    string `json:"timestamp"`
}
```

## Step 9: Main Application

Create main application entry point.

### Create `services/order-service/cmd/order/main.go`:

```go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/IBM/sarama"
	"github.com/jackc/pgx/v5/pgxpool"

	"yourusername/online-storage/order-service/internal/db"
	"yourusername/online-storage/order-service/internal/kafka"
	"yourusername/online-storage/order-service/internal/order"
	"yourusername/online-storage/order-service/pkg/models"
)

type EventPublisherImpl struct {
	producer *kafka.Producer
}

func (e *EventPublisherImpl) PublishOrderPaid(ctx context.Context, event *models.OrderPaidEvent) error {
	return e.producer.PublishOrderPaid(ctx, event)
}

func (e *EventPublisherImpl) PublishOrderCancelled(ctx context.Context, event *models.OrderCancelledEvent) error {
	return e.producer.PublishOrderCancelled(ctx, event)
}

func (e *EventPublisherImpl) PublishOrderShipped(ctx context.Context, event *models.OrderShippedEvent) error {
	return e.producer.PublishOrderShipped(ctx, event)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration
	kafkaBrokers := []string{getEnv("KAFKA_BROKERS", "kafka:9092")}
	kafkaClientID := getEnv("KAFKA_CLIENT_ID", "order-service")
	kafkaGroupID := getEnv("KAFKA_GROUP_ID", "order-service-group")

	dbDSN := getEnv("DB_DSN", "host=postgres port=5432 user=admin password=secret dbname=online_storage sslmode=disable")

	// Connect to database
	log.Println("Connecting to database...")
	pool, err := pgxpool.New(context.Background(), dbDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Initialize database repository
	repo := db.NewRepository(pool)

	// Initialize Kafka producer
	log.Println("Initializing Kafka producer...")
	producer, err := kafka.NewProducer(kafkaBrokers, kafkaClientID)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}
	defer producer.Close()

	// Initialize order service
	eventPublisher := &EventPublisherImpl{producer: producer}
	orderService := order.NewService(repo, eventPublisher)

	// Initialize Kafka consumer
	log.Println("Initializing Kafka consumer...")
	consumer := kafka.NewConsumer(orderService)

	// Setup consumer group
	config := sarama.NewConfig()
	config.ClientID = kafkaClientID
	config.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
	config.Consumer.Group.Session.Timeout = 10 * time.Second
	config.Consumer.Group.Heartbeat.Interval = 3 * time.Second
	config.Consumer.MaxProcessingTime = 30 * time.Second
	config.Consumer.Offsets.Initial = sarama.OffsetOldest

	consumerGroup, err := sarama.NewConsumerGroup(kafkaBrokers, kafkaGroupID, config)
	if err != nil {
		log.Fatalf("Failed to create Kafka consumer group: %v", err)
	}
	defer consumerGroup.Close()

	// Define topics to consume
	topics := []string{
		"orders.created",
		"payments.succeeded",
		"payments.failed",
		"inventory.reserved",
		"inventory.out_of_stock",
	}

	// Start consuming in a goroutine
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		for {
			if err := consumerGroup.Consume(ctx, topics, consumer.Handler()); err != nil {
				log.Printf("Consumer error: %v", err)
			}

			// Check if context was cancelled
			if ctx.Err() != nil {
				return
			}
		}
	}()

	log.Println("Order service is running...")
	log.Printf("Consuming topics: %v", topics)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down order service...")
	cancel()

	// Graceful shutdown
	time.Sleep(2 * time.Second)

	log.Println("Order service stopped")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

## Step 10: Run and Test

Build and run Order service:

```bash
cd services/order-service

# Build application
go build -o bin/order ./cmd/order

# Run with Docker
docker compose up order-service

# View logs
docker compose logs -f order-service
```

## Step 11: Testing

Test Order service by publishing events to Kafka.

### Create `scripts/test-order-service.sh`:

```bash
#!/bin/bash

# Test Order Service by publishing test events

KAFKA_BROKER="localhost:9092"

echo "Testing Order Service..."

# Publish order.created event
docker exec -i online-storage-kafka kafka-console-producer \
  --broker-list "$KAFKA_BROKER" \
  --topic orders.created \
  --property "parse.key=true" \
  --property "key.separator=:" <<< "order-1:{\"order_id\":\"$(uuidgen)\",\"user_id\":\"$(uuidgen)\",\"total\":\"29.99\",\"currency\":\"USD\",\"items_count\":2,\"items\":[{\"product_id\":\"$(uuidgen)\",\"quantity\":1,\"price\":\"9.99\"},{\"product_id\":\"$(uuidgen)\",\"quantity\":1,\"price\":\"20.00\"}]}"

echo "Published order.created event"

# Watch logs to see processing
docker compose logs -f order-service
```

Make script executable:

```bash
chmod +x scripts/test-order-service.sh
```

## Step 12: Update Makefile

Add Order service-related targets to Makefile:

```makefile
# Order service targets
order-service-logs:
	docker compose logs -f order-service

order-service-restart:
	docker compose restart order-service

# Test order service
test-order-service:
	@./scripts/test-order-service.sh
```

## Step 13: Event Flow

The Order service handles the following event flow:

1. **Order Created** (`orders.created`)
   - Consumed to acknowledge order creation
   - Order waits for payment

2. **Payment Succeeded** (`payments.succeeded`)
   - Consumed when payment is successful
   - Order status updated to "paid"
   - Publishes `orders.paid` event

3. **Payment Failed** (`payments.failed`)
   - Consumed when payment fails
   - Order status updated to "payment_failed"
   - Allows customer to retry payment

4. **Inventory Reserved** (`inventory.reserved`)
   - Consumed when inventory is successfully reserved
   - Order status updated to "processing"

5. **Inventory Out of Stock** (`inventory.out_of_stock`)
   - Consumed when inventory is insufficient
   - Order status updated to "cancelled"
   - Publishes `orders.cancelled` event

## Next Steps

With Order service implemented, continue to the next implementation guide: [07-payment-service.md](./07-payment-service.md)

## Troubleshooting

### Consumer not receiving messages
- Check Kafka topics exist: `make kafka-list-topics`
- Verify consumer group status: `make kafka-consumer-groups`
- Check service logs: `docker compose logs order-service`

### Database connection failed
- Verify PostgreSQL is running: `docker compose ps postgres`
- Check connection string in environment variables
- Review network connectivity between containers

### Message processing errors
- Check service logs for error details
- Validate message format and schema
- Verify event order and dependencies

### Events not being published
- Check Kafka producer configuration
- Verify broker addresses are correct
- Review producer logs for connection issues
