# Payment Service Implementation

This guide implements the Payment service, which handles payment processing, integrates with payment providers (e.g., Stripe), and consumes/publishes payment-related events via Kafka.

## Step 1: Initialize Go Module

Create and initialize Payment service:

```bash
cd services/payment-service

# Initialize Go module
go mod init github.com/yourusername/online-storage/payment-service

# Add dependencies
go get github.com/IBM/sarama
go get github.com/jackc/pgx/v5
go get github.com/google/uuid
go get github.com/stripe/stripe-go/v76
```

## Step 2: Project Structure

Create directory structure:

```bash
cd services/payment-service

mkdir -p cmd/payment
mkdir -p internal/payment
mkdir -p internal/kafka
mkdir -p internal/db
mkdir -p internal/stripe
mkdir -p pkg/models
```

## Step 3: Dockerfile

Create Dockerfile for Payment service.

### Create `services/payment-service/Dockerfile`:

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
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/payment ./cmd/payment

# Runtime stage
FROM alpine:3.18

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/bin/payment /app/payment

# Set timezone
ENV TZ=UTC

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8082/health || exit 1

# Run application
CMD ["/app/payment"]
```

### Create `services/payment-service/.dockerignore`:

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

## Step 4: Payment Business Logic

Create payment business logic module.

### Create `services/payment-service/internal/payment/payment.go`:

```go
package payment

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"yourusername/online-storage/payment-service/internal/db"
	"yourusername/online-storage/payment-service/internal/stripe"
	"yourusername/online-storage/payment-service/pkg/models"
)

// Service handles payment business logic
type Service struct {
	dbRepo     db.Repository
	stripe      *stripe.Service
	publisher   EventPublisher
}

// Repository defines database operations for payments
type Repository interface {
	CreatePayment(ctx context.Context, payment *models.Payment) error
	GetPaymentByID(ctx context.Context, paymentID string) (*models.Payment, error)
	UpdatePaymentStatus(ctx context.Context, paymentID string, status string) error
	GetPaymentByOrderID(ctx context.Context, orderID string) (*models.Payment, error)
	CreatePaymentEvent(ctx context.Context, event *models.PaymentEvent) error
	GetPaymentEvents(ctx context.Context, paymentID string) ([]models.PaymentEvent, error)
}

// EventPublisher defines event publishing interface
type EventPublisher interface {
	PublishPaymentInitiated(ctx context.Context, event *models.PaymentInitiatedEvent) error
	PublishPaymentSucceeded(ctx context.Context, event *models.PaymentSucceededEvent) error
	PublishPaymentFailed(ctx context.Context, event *models.PaymentFailedEvent) error
}

// NewService creates a new payment service
func NewService(repo db.Repository, stripe *stripe.Service, publisher EventPublisher) *Service {
	return &Service{
		dbRepo:   repo,
		stripe:    stripe,
		publisher: publisher,
	}
}

// HandleOrderCreated processes an order creation event
func (s *Service) HandleOrderCreated(ctx context.Context, orderID string, total float64) error {
	// Check if payment already exists for this order
	_, err := s.dbRepo.GetPaymentByOrderID(ctx, orderID)
	if err == nil {
		// Payment already exists, skip
		return fmt.Errorf("payment already exists for order %s", orderID)
	}

	// Create a payment intent in Stripe
	stripeAmount := int64(total * 100) // Convert to cents
	paymentIntent, err := s.stripe.CreatePaymentIntent(ctx, &stripe.CreatePaymentIntentRequest{
		Amount:   stripeAmount,
		Currency: "usd",
		Metadata: map[string]string{
			"order_id": orderID,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create payment intent: %w", err)
	}

	// Create payment record
	payment := &models.Payment{
		ID:            uuid.New(),
		OrderID:       uuid.MustParse(orderID),
		Provider:      "stripe",
		ProviderID:     paymentIntent.ID,
		Amount:        total,
		Currency:      "usd",
		Status:        "pending",
		PaymentMethod: paymentIntent.PaymentMethodTypes[0],
	}

	if err := s.dbRepo.CreatePayment(ctx, payment); err != nil {
		return fmt.Errorf("failed to create payment record: %w", err)
	}

	// Publish payment.initiated event
	event := &models.PaymentInitiatedEvent{
		PaymentID: payment.ID.String(),
		OrderID:   orderID,
		Amount:     fmt.Sprintf("%.2f", total),
		Currency:   "usd",
		Method:     payment.PaymentMethod,
	}

	if err := s.publisher.PublishPaymentInitiated(ctx, event); err != nil {
		return fmt.Errorf("failed to publish payment.initiated event: %w", err)
	}

	fmt.Printf("Payment initiated for order %s, payment ID: %s\n", orderID, payment.ID)
	return nil
}

// ProcessPaymentWebhook processes a Stripe webhook
func (s *Service) ProcessPaymentWebhook(ctx context.Context, eventType string, payload []byte) error {
	// Parse webhook event
	event, err := s.stripe.ParseWebhook(eventType, payload)
	if err != nil {
		return fmt.Errorf("failed to parse webhook: %w", err)
	}

	// Get or verify payment intent
	paymentIntentID := event.Data.Object.ID
	payment, err := s.dbRepo.GetPaymentByProviderID(ctx, paymentIntentID)
	if err != nil {
		return fmt.Errorf("failed to get payment: %w", err)
	}

	// Store payment event
	paymentEvent := &models.PaymentEvent{
		ID:        uuid.New(),
		PaymentID:  payment.ID,
		EventType:  eventType,
		Payload:    string(payload),
		CreatedAt:  time.Now().UTC(),
	}

	if err := s.dbRepo.CreatePaymentEvent(ctx, paymentEvent); err != nil {
		return fmt.Errorf("failed to create payment event: %w", err)
	}

	// Handle event type
	switch eventType {
	case "payment_intent.succeeded":
		return s.handlePaymentIntentSucceeded(ctx, payment, event)
	case "payment_intent.payment_failed":
		return s.handlePaymentIntentFailed(ctx, payment, event)
	default:
		fmt.Printf("Ignoring event type: %s\n", eventType)
		return nil
	}
}

func (s *Service) handlePaymentIntentSucceeded(ctx context.Context, payment *models.Payment, event *stripe.WebhookEvent) error {
	// Update payment status
	if err := s.dbRepo.UpdatePaymentStatus(ctx, payment.ID.String(), "succeeded"); err != nil {
		return fmt.Errorf("failed to update payment status: %w", err)
	}

	// Publish payments.succeeded event
	paidEvent := &models.PaymentSucceededEvent{
		PaymentID:     payment.ID.String(),
		OrderID:       payment.OrderID.String(),
		UserID:        payment.UserID.String(),
		Amount:        fmt.Sprintf("%.2f", payment.Amount),
		Currency:      payment.Currency,
		PaymentDate:   time.Now().UTC().Format(time.RFC3339),
		PaymentMethod: payment.PaymentMethod,
		ProviderID:    payment.ProviderID,
	}

	if err := s.publisher.PublishPaymentSucceeded(ctx, paidEvent); err != nil {
		return fmt.Errorf("failed to publish payments.succeeded event: %w", err)
	}

	fmt.Printf("Payment succeeded: %s for order %s\n", payment.ID, payment.OrderID)
	return nil
}

func (s *Service) handlePaymentIntentFailed(ctx context.Context, payment *models.Payment, event *stripe.WebhookEvent) error {
	// Update payment status
	if err := s.dbRepo.UpdatePaymentStatus(ctx, payment.ID.String(), "failed"); err != nil {
		return fmt.Errorf("failed to update payment status: %w", err)
	}

	// Publish payments.failed event
	failedEvent := &models.PaymentFailedEvent{
		PaymentID: payment.ID.String(),
		OrderID:   payment.OrderID.String(),
		UserID:    payment.UserID.String(),
		Amount:    fmt.Sprintf("%.2f", payment.Amount),
		Currency:  payment.Currency,
		Reason:    "Payment failed",
		Code:      "payment_failed",
	}

	if err := s.publisher.PublishPaymentFailed(ctx, failedEvent); err != nil {
		return fmt.Errorf("failed to publish payments.failed event: %w", err)
	}

	fmt.Printf("Payment failed: %s for order %s\n", payment.ID, payment.OrderID)
	return nil
}

// RefundPayment processes a refund
func (s *Service) RefundPayment(ctx context.Context, paymentID string, amount float64) error {
	// Get payment
	payment, err := s.dbRepo.GetPaymentByID(ctx, paymentID)
	if err != nil {
		return fmt.Errorf("failed to get payment: %w", err)
	}

	// Create refund in Stripe
	stripeAmount := int64(amount * 100) // Convert to cents
	refund, err := s.stripe.CreateRefund(ctx, &stripe.CreateRefundRequest{
		PaymentIntent: payment.ProviderID,
		Amount:       stripeAmount,
	})
	if err != nil {
		return fmt.Errorf("failed to create refund: %w", err)
	}

	// Update payment status
	if amount >= payment.Amount {
		// Full refund
		if err := s.dbRepo.UpdatePaymentStatus(ctx, paymentID, "refunded"); err != nil {
			return fmt.Errorf("failed to update payment status: %w", err)
		}
	} else {
		// Partial refund
		if err := s.dbRepo.UpdatePaymentStatus(ctx, paymentID, "partially_refunded"); err != nil {
			return fmt.Errorf("failed to update payment status: %w", err)
		}
	}

	fmt.Printf("Refund created: %s for payment %s\n", refund.ID, paymentID)
	return nil
}

// GetPayment retrieves a payment by ID
func (s *Service) GetPayment(ctx context.Context, paymentID string) (*models.Payment, error) {
	return s.dbRepo.GetPaymentByID(ctx, paymentID)
}
```

## Step 5: Database Repository

Create database repository for Payment service.

### Create `services/payment-service/internal/db/repository.go`:

```go
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"yourusername/online-storage/payment-service/pkg/models"
)

// Repository implements payment repository interface
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new payment repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// CreatePayment creates a new payment
func (r *Repository) CreatePayment(ctx context.Context, payment *models.Payment) error {
	query := `
		INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status, payment_method_id, payment_method_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at, updated_at
	`
	err := r.pool.QueryRow(
		ctx,
		query,
		payment.ID, payment.OrderID, payment.Provider, payment.ProviderID,
		payment.Amount, payment.Currency, payment.Status, payment.PaymentMethodID,
		payment.PaymentMethodType,
	).Scan(&payment.CreatedAt, &payment.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create payment: %w", err)
	}

	return nil
}

// GetPaymentByID retrieves a payment by ID
func (r *Repository) GetPaymentByID(ctx context.Context, paymentID string) (*models.Payment, error) {
	var payment models.Payment

	query := `
		SELECT id, order_id, provider, provider_payment_id, amount, currency, status,
		       payment_method_id, payment_method_type, metadata, created_at, updated_at
		FROM payments
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, paymentID).Scan(
		&payment.ID, &payment.OrderID, &payment.Provider, &payment.ProviderID,
		&payment.Amount, &payment.Currency, &payment.Status, &payment.PaymentMethodID,
		&payment.PaymentMethodType, &payment.Metadata, &payment.CreatedAt, &payment.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get payment: %w", err)
	}

	return &payment, nil
}

// GetPaymentByProviderID retrieves a payment by provider payment ID
func (r *Repository) GetPaymentByProviderID(ctx context.Context, providerID string) (*models.Payment, error) {
	var payment models.Payment

	query := `
		SELECT id, order_id, provider, provider_payment_id, amount, currency, status,
		       payment_method_id, payment_method_type, metadata, created_at, updated_at
		FROM payments
		WHERE provider_payment_id = $1
	`
	err := r.pool.QueryRow(ctx, query, providerID).Scan(
		&payment.ID, &payment.OrderID, &payment.Provider, &payment.ProviderID,
		&payment.Amount, &payment.Currency, &payment.Status, &payment.PaymentMethodID,
		&payment.PaymentMethodType, &payment.Metadata, &payment.CreatedAt, &payment.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get payment by provider ID: %w", err)
	}

	return &payment, nil
}

// GetPaymentByOrderID retrieves a payment by order ID
func (r *Repository) GetPaymentByOrderID(ctx context.Context, orderID string) (*models.Payment, error) {
	var payment models.Payment

	query := `
		SELECT id, order_id, provider, provider_payment_id, amount, currency, status,
		       payment_method_id, payment_method_type, metadata, created_at, updated_at
		FROM payments
		WHERE order_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	err := r.pool.QueryRow(ctx, query, orderID).Scan(
		&payment.ID, &payment.OrderID, &payment.Provider, &payment.ProviderID,
		&payment.Amount, &payment.Currency, &payment.Status, &payment.PaymentMethodID,
		&payment.PaymentMethodType, &payment.Metadata, &payment.CreatedAt, &payment.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get payment by order ID: %w", err)
	}

	return &payment, nil
}

// UpdatePaymentStatus updates status of a payment
func (r *Repository) UpdatePaymentStatus(ctx context.Context, paymentID string, status string) error {
	query := `
		UPDATE payments
		SET status = $1, updated_at = NOW()
		WHERE id = $2
	`
	result, err := r.pool.Exec(ctx, query, status, paymentID)
	if err != nil {
		return fmt.Errorf("failed to update payment status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("payment not found: %s", paymentID)
	}

	return nil
}

// CreatePaymentEvent creates a new payment event
func (r *Repository) CreatePaymentEvent(ctx context.Context, event *models.PaymentEvent) error {
	query := `
		INSERT INTO payment_events (payment_id, event_type, provider_event_id, payload, processed, processed_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.pool.Exec(
		ctx,
		query,
		event.PaymentID, event.EventType, event.ProviderEventID,
		event.Payload, event.Processed, event.ProcessedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create payment event: %w", err)
	}

	return nil
}

// GetPaymentEvents retrieves payment events
func (r *Repository) GetPaymentEvents(ctx context.Context, paymentID string) ([]models.PaymentEvent, error) {
	query := `
		SELECT id, payment_id, event_type, provider_event_id, payload, processed, processed_at, created_at
		FROM payment_events
		WHERE payment_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, paymentID)
	if err != nil {
		return nil, fmt.Errorf("failed to get payment events: %w", err)
	}
	defer rows.Close()

	var events []models.PaymentEvent
	for rows.Next() {
		var event models.PaymentEvent
		err := rows.Scan(
			&event.ID, &event.PaymentID, &event.EventType, &event.ProviderEventID,
			&event.Payload, &event.Processed, &event.ProcessedAt, &event.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan payment event: %w", err)
		}
		events = append(events, event)
	}

	return events, nil
}
```

## Step 6: Stripe Integration

Create Stripe integration module.

### Create `services/payment-service/internal/stripe/stripe.go`:

```go
package stripe

import (
	"context"
	"fmt"

	stripeSDK "github.com/stripe/stripe-go/v76"
)

// Service handles Stripe integration
type Service struct {
	client *stripeSDK.Client
}

// CreatePaymentIntentRequest represents a request to create payment intent
type CreatePaymentIntentRequest struct {
	Amount   int64
	Currency string
	Metadata map[string]string
}

// WebhookEvent represents a Stripe webhook event
type WebhookEvent struct {
	ID      string
	Data     struct {
		Object struct {
			ID string
		}
	}
	Type string
}

// NewService creates a new Stripe service
func NewService(secretKey string) *Service {
	stripeSDK.Key = secretKey
	return &Service{
		client: stripeSDK.New(secretKey, nil),
	}
}

// CreatePaymentIntent creates a payment intent in Stripe
func (s *Service) CreatePaymentIntent(ctx context.Context, req *CreatePaymentIntentRequest) (*stripeSDK.PaymentIntent, error) {
	params := &stripeSDK.PaymentIntentParams{
		Amount:   stripeSDK.Int64(req.Amount),
		Currency: stripeSDK.String(req.Currency),
		Metadata: req.Metadata,
	}

	intent, err := s.client.PaymentIntents.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment intent: %w", err)
	}

	return intent, nil
}

// CreateRefund creates a refund in Stripe
func (s *Service) CreateRefund(ctx context.Context, req *CreateRefundRequest) (*stripeSDK.Refund, error) {
	params := &stripeSDK.RefundParams{
		PaymentIntent: stripeSDK.String(req.PaymentIntent),
		Amount:       stripeSDK.Int64(req.Amount),
	}

	refund, err := s.client.Refunds.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create refund: %w", err)
	}

	return refund, nil
}

// CreateRefundRequest represents a request to create refund
type CreateRefundRequest struct {
	PaymentIntent string
	Amount       int64
}

// ParseWebhook parses a Stripe webhook event
func (s *Service) ParseWebhook(eventType string, payload []byte) (*WebhookEvent, error) {
	// Parse event (simplified - in production, verify webhook signature)
	event := stripeSDK.Event{}
	if err := event.UnmarshalJSON(payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal webhook event: %w", err)
	}

	webhookEvent := &WebhookEvent{
		ID:  event.ID,
		Type: event.Type,
	}

	if event.Data.Object != nil {
		if paymentIntent, ok := event.Data.Object.(*stripeSDK.PaymentIntent); ok {
			webhookEvent.Data.Object.ID = paymentIntent.ID
		}
	}

	return webhookEvent, nil
}
```

## Step 7: Kafka Consumer

Create Kafka consumer for payment events.

### Create `services/payment-service/internal/kafka/consumer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/IBM/sarama"
	"yourusername/online-storage/payment-service/internal/payment"
	"yourusername/online-storage/payment-service/pkg/models"
)

// Consumer handles payment-related Kafka events
type Consumer struct {
	paymentService *payment.Service
}

// NewConsumer creates a new payment event consumer
func NewConsumer(paymentService *payment.Service) *Consumer {
	return &Consumer{
		paymentService: paymentService,
	}
}

// Handler implements sarama.ConsumerGroupHandler
func (c *Consumer) Handler() sarama.ConsumerGroupHandler {
	return c
}

// Setup is called at beginning of a new session
func (c *Consumer) Setup(session sarama.ConsumerGroupSession) error {
	log.Println("Payment service consumer session started")
	return nil
}

// Cleanup is called at the end of a session
func (c *Consumer) Cleanup(session sarama.ConsumerGroupSession) error {
	log.Println("Payment service consumer session ended")
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
		default:
			log.Printf("Unknown topic: %s", message.Topic)
		}

		if err != nil {
			log.Printf("Error processing message: %v", err)
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

	// Parse total as float64
	var total float64
	if _, err := fmt.Sscanf(event.Total, "%f", &total); err != nil {
		return fmt.Errorf("failed to parse total: %w", err)
	}

	return c.paymentService.HandleOrderCreated(ctx, event.OrderID, total)
}
```

## Step 8: Kafka Producer

Create Kafka producer for publishing payment events.

### Create `services/payment-service/internal/kafka/producer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/IBM/sarama"
	"yourusername/online-storage/payment-service/pkg/models"
)

// Producer handles publishing payment events to Kafka
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

// PublishPaymentInitiated publishes a payment initiated event
func (p *Producer) PublishPaymentInitiated(ctx context.Context, event *models.PaymentInitiatedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "payments.initiated",
		Key:   sarama.StringEncoder(event.PaymentID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published payments.initiated event for payment %s\n", event.PaymentID)
	return nil
}

// PublishPaymentSucceeded publishes a payment succeeded event
func (p *Producer) PublishPaymentSucceeded(ctx context.Context, event *models.PaymentSucceededEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "payments.succeeded",
		Key:   sarama.StringEncoder(event.PaymentID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published payments.succeeded event for payment %s\n", event.PaymentID)
	return nil
}

// PublishPaymentFailed publishes a payment failed event
func (p *Producer) PublishPaymentFailed(ctx context.Context, event *models.PaymentFailedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "payments.failed",
		Key:   sarama.StringEncoder(event.PaymentID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published payments.failed event for payment %s\n", event.PaymentID)
	return nil
}

// Close closes the producer
func (p *Producer) Close() error {
	return p.producer.Close()
}
```

## Step 9: Models

Create models for Payment service.

### Create `services/payment-service/pkg/models/payment.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Payment represents a payment
type Payment struct {
	ID               uuid.UUID              `json:"id"`
	OrderID           uuid.UUID              `json:"order_id"`
	Provider          string                 `json:"provider"`
	ProviderID        string                 `json:"provider_payment_id"`
	Amount            float64                `json:"amount"`
	Currency          string                 `json:"currency"`
	Status            string                 `json:"status"`
	PaymentMethodID   string                 `json:"payment_method_id,omitempty"`
	PaymentMethodType string                 `json:"payment_method_type,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

// PaymentEvent represents a payment event
type PaymentEvent struct {
	ID              uuid.UUID `json:"id"`
	PaymentID       uuid.UUID `json:"payment_id"`
	EventType       string    `json:"event_type"`
	ProviderEventID string    `json:"provider_event_id,omitempty"`
	Payload         string    `json:"payload"`
	Processed       bool      `json:"processed"`
	ProcessedAt     *time.Time `json:"processed_at,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Event Models
type PaymentInitiatedEvent struct {
	PaymentID string `json:"payment_id"`
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id,omitempty"`
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Method    string `json:"method"`
}

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

// Order Events (consumed)
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
```

## Step 10: Main Application

Create main application entry point.

### Create `services/payment-service/cmd/payment/main.go`:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/IBM/sarama"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/gorilla/mux"

	"yourusername/online-storage/payment-service/internal/db"
	"yourusername/online-storage/payment-service/internal/kafka"
	"yourusername/online-storage/payment-service/internal/payment"
	"yourusername/online-storage/payment-service/internal/stripe"
	"yourusername/online-storage/payment-service/pkg/models"
)

type EventPublisherImpl struct {
	producer *kafka.Producer
}

func (e *EventPublisherImpl) PublishPaymentInitiated(ctx context.Context, event *models.PaymentInitiatedEvent) error {
	return e.producer.PublishPaymentInitiated(ctx, event)
}

func (e *EventPublisherImpl) PublishPaymentSucceeded(ctx context.Context, event *models.PaymentSucceededEvent) error {
	return e.producer.PublishPaymentSucceeded(ctx, event)
}

func (e *EventPublisherImpl) PublishPaymentFailed(ctx context.Context, event *models.PaymentFailedEvent) error {
	return e.producer.PublishPaymentFailed(ctx, event)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration
	kafkaBrokers := []string{getEnv("KAFKA_BROKERS", "kafka:9092")}
	kafkaClientID := getEnv("KAFKA_CLIENT_ID", "payment-service")
	kafkaGroupID := getEnv("KAFKA_GROUP_ID", "payment-service-group")

	dbDSN := getEnv("DB_DSN", "host=postgres port=5432 user=admin password=secret dbname=online_storage sslmode=disable")

	stripeSecretKey := getEnv("STRIPE_SECRET_KEY", "")
	if stripeSecretKey == "" {
		log.Fatal("STRIPE_SECRET_KEY environment variable is required")
	}

	// Connect to database
	log.Println("Connecting to database...")
	pool, err := pgxpool.New(context.Background(), dbDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Initialize database repository
	repo := db.NewRepository(pool)

	// Initialize Stripe service
	log.Println("Initializing Stripe service...")
	stripeService := stripe.NewService(stripeSecretKey)

	// Initialize Kafka producer
	log.Println("Initializing Kafka producer...")
	producer, err := kafka.NewProducer(kafkaBrokers, kafkaClientID)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}
	defer producer.Close()

	// Initialize payment service
	eventPublisher := &EventPublisherImpl{producer: producer}
	paymentService := payment.NewService(repo, stripeService, eventPublisher)

	// Initialize HTTP server for webhooks
	go func() {
		router := setupWebhookRouter(paymentService)
		port := getEnv("SERVICE_PORT", "8082")
		log.Printf("Webhook server starting on port %s...", port)

		server := &http.Server{
			Addr:         ":" + port,
			Handler:      router,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
		}

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Webhook server failed: %v", err)
		}
	}()

	// Initialize Kafka consumer
	log.Println("Initializing Kafka consumer...")
	kafkaConsumer := kafka.NewConsumer(paymentService)

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
	topics := []string{"orders.created"}

	// Start consuming in a goroutine
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		for {
			if err := consumerGroup.Consume(ctx, topics, kafkaConsumer.Handler()); err != nil {
				log.Printf("Consumer error: %v", err)
			}

			if ctx.Err() != nil {
				return
			}
		}
	}()

	log.Println("Payment service is running...")
	log.Printf("Consuming topics: %v", topics)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down payment service...")
	cancel()

	time.Sleep(2 * time.Second)
	log.Println("Payment service stopped")
}

func setupWebhookRouter(paymentService *payment.Service) *mux.Router {
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	}).Methods("GET")

	// Stripe webhook endpoint
	router.HandleFunc("/webhooks/stripe", func(w http.ResponseWriter, r *http.Request) {
		// Get event type from Stripe-Signature header
		eventType := r.Header.Get("Stripe-Signature")

		// Read body
		body := make([]byte, r.ContentLength)
		_, err := r.Body.Read(body)
		if err != nil {
			log.Printf("Failed to read webhook body: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Process webhook
		if err := paymentService.ProcessPaymentWebhook(r.Context(), eventType, body); err != nil {
			log.Printf("Failed to process webhook: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusOK)
	}).Methods("POST")

	return router
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

## Step 11: Run and Test

Build and run Payment service:

```bash
cd services/payment-service

# Build application
go build -o bin/payment ./cmd/payment

# Run with Docker
docker compose up payment-service

# View logs
docker compose logs -f payment-service
```

## Step 12: Testing

Test Payment service by simulating Stripe webhooks.

### Create `scripts/test-payment-webhook.sh`:

```bash
#!/bin/bash

# Test Payment Service webhook endpoint

WEBHOOK_URL="http://localhost:8082/webhooks/stripe"

echo "Testing Payment Service webhook..."

# Send test webhook payload
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: test-signature" \
  -d '{
    "id": "evt_test123",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_test123"
      }
    }
  }'

echo ""
echo "Webhook sent"
```

Make script executable:

```bash
chmod +x scripts/test-payment-webhook.sh
```

## Step 13: Update Makefile

Add Payment service-related targets to Makefile:

```makefile
# Payment service targets
payment-service-logs:
	docker compose logs -f payment-service

payment-service-restart:
	docker compose restart payment-service

# Test payment service
test-payment-webhook:
	@./scripts/test-payment-webhook.sh
```

## Step 14: Event Flow

The Payment service handles the following event flow:

1. **Order Created** (`orders.created`) - Consumed
   - Creates payment intent in Stripe
   - Creates payment record in database
   - Publishes `payments.initiated` event

2. **Payment Succeeded** (Stripe webhook) - Handled
   - Updates payment status to "succeeded"
   - Publishes `payments.succeeded` event

3. **Payment Failed** (Stripe webhook) - Handled
   - Updates payment status to "failed"
   - Publishes `payments.failed` event

## Next Steps

With Payment service implemented, continue to the next implementation guide: [08-inventory-service.md](./08-inventory-service.md)

## Troubleshooting

### Webhook not received
- Verify Stripe webhook URL is correctly configured
- Check NGINX routing: `make nginx-config-test`
- Review payment service logs: `docker compose logs payment-service`

### Stripe API errors
- Verify STRIPE_SECRET_KEY is set correctly
- Check Stripe account status and limits
- Review webhook payload format

### Payment creation fails
- Check database connection: `docker compose logs payment-service`
- Verify order exists in database
- Review Kafka producer logs for connection issues

### Duplicate payments
- Check if payment already exists for order ID
- Review event processing logic
- Ensure idempotency in payment creation
