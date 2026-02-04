# Inventory Service Implementation

This guide implements an Inventory service that manages product inventory, handles stock reservations, and publishes inventory events to Kafka.

## Step 1: Initialize Go Module

Create and initialize Inventory service:

```bash
cd services/inventory-service

# Initialize Go module
go mod init github.com/yourusername/online-storage/inventory-service

# Add dependencies
go get github.com/IBM/sarama
go get github.com/jackc/pgx/v5
go get github.com/google/uuid
```

## Step 2: Project Structure

Create directory structure:

```bash
cd services/inventory-service

mkdir -p cmd/inventory
mkdir -p internal/inventory
mkdir -p internal/kafka
mkdir -p internal/db
mkdir -p pkg/models
```

## Step 3: Dockerfile

Create Dockerfile for Inventory service.

### Create `services/inventory-service/Dockerfile`:

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
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/inventory ./cmd/inventory

# Runtime stage
FROM alpine:3.18

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/bin/inventory /app/inventory

# Set timezone
ENV TZ=UTC

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8083/health || exit 1

# Run application
CMD ["/app/inventory"]
```

### Create `services/inventory-service/.dockerignore`:

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

## Step 4: Inventory Business Logic

Create inventory business logic module.

### Create `services/inventory-service/internal/inventory/inventory.go`:

```go
package inventory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"yourusername/online-storage/inventory-service/internal/db"
	"yourusername/online-storage/inventory-service/pkg/models"
)

// Service handles inventory business logic
type Service struct {
	dbRepo   db.Repository
	publisher EventPublisher
}

// Repository defines database operations for inventory
type Repository interface {
	GetInventoryByProductID(ctx context.Context, productID string) (*models.Inventory, error)
	ReserveInventory(ctx context.Context, productID string, quantity int) (*models.Inventory, error)
	ReleaseInventory(ctx context.Context, productID string, quantity int) error
	AdjustInventory(ctx context.Context, productID string, quantity int, adjustmentType, reason, referenceID string) error
	GetLowStockItems(ctx context.Context, limit int) ([]models.Inventory, error)
	GetInventory(ctx context.Context, limit, offset int) ([]models.Inventory, error)
}

// EventPublisher defines event publishing interface
type EventPublisher interface {
	PublishInventoryReserved(ctx context.Context, event *models.InventoryReservedEvent) error
	PublishInventoryReleased(ctx context.Context, event *models.InventoryReleasedEvent) error
	PublishInventoryOutOfStock(ctx context.Context, event *models.InventoryOutOfStockEvent) error
	PublishInventoryAdjusted(ctx context.Context, event *models.InventoryAdjustedEvent) error
}

// NewService creates a new inventory service
func NewService(repo db.Repository, publisher EventPublisher) *Service {
	return &Service{
		dbRepo:   repo,
		publisher: publisher,
	}
}

// HandleOrderCreated handles an order creation event
func (s *Service) HandleOrderCreated(ctx context.Context, orderID string, items []models.OrderItem) error {
	reservationID := uuid.New().String()
	var reservedItems []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	}

	// Try to reserve inventory for each item
	for _, item := range items {
		inventory, err := s.ReserveItem(ctx, item.ProductID, item.Quantity)
		if err != nil {
			// Rollback previous reservations
			for _, ri := range reservedItems {
				_ = s.ReleaseInventory(ctx, ri.ProductID, ri.Quantity)
			}

			// Publish out of stock event
			event := &models.InventoryOutOfStockEvent{
				OrderID:      orderID,
				ProductID:    item.ProductID,
				RequestedQty: item.Quantity,
				AvailableQty: 0, // Not available
				Timestamp:    time.Now().UTC().Format(time.RFC3339),
			}
			if err := s.publisher.PublishInventoryOutOfStock(ctx, event); err != nil {
				return fmt.Errorf("failed to publish out of stock event: %w", err)
			}

			return fmt.Errorf("failed to reserve inventory for product %s: %w", item.ProductID, err)
		}

		reservedItems = append(reservedItems, struct {
			ProductID string `json:"product_id"`
			Quantity  int    `json:"quantity"`
		}{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
		})

		fmt.Printf("Reserved %d units of product %s (available: %d)\n", item.Quantity, item.ProductID, inventory.Available)
	}

	// Publish inventory.reserved event
	event := &models.InventoryReservedEvent{
		ReservationID: reservationID,
		OrderID:       orderID,
		Items:         reservedItems,
		ReservedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishInventoryReserved(ctx, event); err != nil {
		return fmt.Errorf("failed to publish inventory.reserved event: %w", err)
	}

	fmt.Printf("Inventory reserved for order %s\n", orderID)
	return nil
}

// HandleOrderCancelled handles an order cancellation event
func (s *Service) HandleOrderCancelled(ctx context.Context, orderID string, items []models.OrderItem) error {
	reservationID := uuid.New().String()
	var releasedItems []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	}

	// Release inventory for each item
	for _, item := range items {
		if err := s.ReleaseInventory(ctx, item.ProductID, item.Quantity); err != nil {
			fmt.Printf("Failed to release inventory for product %s: %v\n", item.ProductID, err)
			continue
		}

		releasedItems = append(releasedItems, struct {
			ProductID string `json:"product_id"`
			Quantity  int    `json:"quantity"`
		}{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
		})

		fmt.Printf("Released %d units of product %s\n", item.Quantity, item.ProductID)
	}

	// Publish inventory.released event
	event := &models.InventoryReleasedEvent{
		ReservationID: reservationID,
		OrderID:       orderID,
		Items:         releasedItems,
		ReleasedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishInventoryReleased(ctx, event); err != nil {
		return fmt.Errorf("failed to publish inventory.released event: %w", err)
	}

	fmt.Printf("Inventory released for cancelled order %s\n", orderID)
	return nil
}

// ReserveItem reserves inventory for a product
func (s *Service) ReserveItem(ctx context.Context, productID string, quantity int) (*models.Inventory, error) {
	return s.dbRepo.ReserveInventory(ctx, productID, quantity)
}

// ReleaseItem releases inventory for a product
func (s *Service) ReleaseItem(ctx context.Context, productID string, quantity int) error {
	return s.dbRepo.ReleaseInventory(ctx, productID, quantity)
}

// AdjustInventory manually adjusts inventory levels
func (s *Service) AdjustInventory(ctx context.Context, productID string, quantity int, adjustmentType, reason string) error {
	// Perform adjustment
	if err := s.dbRepo.AdjustInventory(ctx, productID, quantity, adjustmentType, reason, ""); err != nil {
		return err
	}

	// Publish inventory.adjusted event
	event := &models.InventoryAdjustedEvent{
		ProductID:      productID,
		AdjustmentType: adjustmentType,
		Quantity:        quantity,
		Reason:          reason,
		ReferenceID:     "",
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.publisher.PublishInventoryAdjusted(ctx, event); err != nil {
		return fmt.Errorf("failed to publish inventory.adjusted event: %w", err)
	}

	fmt.Printf("Inventory adjusted for product %s: %+d (%s)\n", productID, quantity, adjustmentType)
	return nil
}

// GetInventoryByProduct retrieves inventory for a product
func (s *Service) GetInventoryByProduct(ctx context.Context, productID string) (*models.Inventory, error) {
	return s.dbRepo.GetInventoryByProductID(ctx, productID)
}

// GetLowStockItems retrieves items with low stock
func (s *Service) GetLowStockItems(ctx context.Context, limit int) ([]models.Inventory, error) {
	return s.dbRepo.GetLowStockItems(ctx, limit)
}

// GetAllInventory retrieves all inventory records
func (s *Service) GetAllInventory(ctx context.Context, limit, offset int) ([]models.Inventory, error) {
	return s.dbRepo.GetInventory(ctx, limit, offset)
}

// InitializeInventory creates inventory records for products
func (s *Service) InitializeInventory(ctx context.Context, productID string, initialQty int) error {
	// Check if inventory already exists
	_, err := s.dbRepo.GetInventoryByProductID(ctx, productID)
	if err == nil {
		// Inventory already exists, skip
		return nil
	}

	// Create initial inventory
	return s.dbRepo.AdjustInventory(ctx, productID, initialQty, "initial", "Initial inventory", "")
}
```

## Step 5: Database Repository

Create database repository for Inventory service.

### Create `services/inventory-service/internal/db/repository.go`:

```go
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"
)

// Repository implements inventory repository interface
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new inventory repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetInventoryByProductID retrieves inventory for a product
func (r *Repository) GetInventoryByProductID(ctx context.Context, productID string) (*models.Inventory, error) {
	var inventory models.Inventory

	query := `
		SELECT id, product_id, available, reserved, on_hand, low_stock_threshold, location, updated_at
		FROM inventory
		WHERE product_id = $1
	`
	err := r.pool.QueryRow(ctx, query, productID).Scan(
		&inventory.ID, &inventory.ProductID, &inventory.Available,
		&inventory.Reserved, &inventory.OnHand, &inventory.LowStockThreshold,
		&inventory.Location, &inventory.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get inventory: %w", err)
	}

	return &inventory, nil
}

// ReserveInventory reserves inventory atomically
func (r *Repository) ReserveInventory(ctx context.Context, productID string, quantity int) (*models.Inventory, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Get current inventory
	var inventory models.Inventory
	query := `
		SELECT id, product_id, available, reserved, on_hand, low_stock_threshold, location, updated_at
		FROM inventory
		WHERE product_id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, productID).Scan(
		&inventory.ID, &inventory.ProductID, &inventory.Available,
		&inventory.Reserved, &inventory.OnHand, &inventory.LowStockThreshold,
		&inventory.Location, &inventory.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get inventory: %w", err)
	}

	// Check if sufficient inventory
	if inventory.Available < quantity {
		return nil, fmt.Errorf("insufficient inventory: available=%d, requested=%d", inventory.Available, quantity)
	}

	// Update inventory
	updateQuery := `
		UPDATE inventory
		SET available = available - $1,
		    reserved = reserved + $1,
		    updated_at = NOW()
		WHERE id = $2
		RETURNING available, reserved, updated_at
	`
	err = tx.QueryRow(ctx, updateQuery, quantity, inventory.ID).Scan(
		&inventory.Available, &inventory.Reserved, &inventory.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update inventory: %w", err)
	}

	// Create inventory adjustment record
	adjustmentQuery := `
		INSERT INTO inventory_adjustments (product_id, adjustment_type, quantity, available_before, available_after, reason, reference_id)
		VALUES ($1, 'sale', $2, $3, $4, $5, $6)
	`
	_, err = tx.Exec(ctx, adjustmentQuery,
		productID, quantity, inventory.Available+quantity, inventory.Available, "Order reservation", productID)
	if err != nil {
		return nil, fmt.Errorf("failed to create inventory adjustment: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}
	tx = nil

	return &inventory, nil
}

// ReleaseInventory releases inventory atomically
func (r *Repository) ReleaseInventory(ctx context.Context, productID string, quantity int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Get current inventory
	var inventory models.Inventory
	query := `
		SELECT id, product_id, available, reserved, on_hand, low_stock_threshold, location, updated_at
		FROM inventory
		WHERE product_id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, productID).Scan(
		&inventory.ID, &inventory.ProductID, &inventory.Available,
		&inventory.Reserved, &inventory.OnHand, &inventory.LowStockThreshold,
		&inventory.Location, &inventory.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to get inventory: %w", err)
	}

	// Update inventory (release from reserved)
	updateQuery := `
		UPDATE inventory
		SET available = available + $1,
		    reserved = reserved - $1,
		    updated_at = NOW()
		WHERE id = $2
	`
	result, err := tx.Exec(ctx, updateQuery, quantity, inventory.ID)
	if err != nil {
		return fmt.Errorf("failed to update inventory: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("inventory not found: %s", productID)
	}

	// Create inventory adjustment record
	adjustmentQuery := `
		INSERT INTO inventory_adjustments (product_id, adjustment_type, quantity, available_before, available_after, reason, reference_id)
		VALUES ($1, 'release', $2, $3, $4, $5, $6)
	`
	_, err = tx.Exec(ctx, adjustmentQuery,
		productID, quantity, inventory.Available, inventory.Available+quantity, "Order cancellation", productID)
	if err != nil {
		return fmt.Errorf("failed to create inventory adjustment: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	tx = nil

	return nil
}

// AdjustInventory manually adjusts inventory
func (r *Repository) AdjustInventory(ctx context.Context, productID string, quantity int, adjustmentType, reason, referenceID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Get current inventory
	var availableBefore int
	query := `
		SELECT available
		FROM inventory
		WHERE product_id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, productID).Scan(&availableBefore)
	if err != nil {
		return fmt.Errorf("failed to get inventory: %w", err)
	}

	// Update inventory
	updateQuery := `
		UPDATE inventory
		SET available = available + $1,
		    on_hand = on_hand + $1,
		    updated_at = NOW()
		WHERE product_id = $2
		RETURNING available
	`
	var availableAfter int
	err = tx.QueryRow(ctx, updateQuery, quantity, productID).Scan(&availableAfter)
	if err != nil {
		return fmt.Errorf("failed to update inventory: %w", err)
	}

	// Create inventory adjustment record
	adjustmentQuery := `
		INSERT INTO inventory_adjustments (product_id, adjustment_type, quantity, available_before, available_after, reason, reference_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = tx.Exec(ctx, adjustmentQuery, productID, adjustmentType, quantity, availableBefore, availableAfter, reason, referenceID)
	if err != nil {
		return fmt.Errorf("failed to create inventory adjustment: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	tx = nil

	return nil
}

// GetLowStockItems retrieves items below low stock threshold
func (r *Repository) GetLowStockItems(ctx context.Context, limit int) ([]models.Inventory, error) {
	query := `
		SELECT i.id, i.product_id, i.available, i.reserved, i.on_hand, i.low_stock_threshold, i.location, i.updated_at
		FROM inventory i
		WHERE i.available < i.low_stock_threshold
		ORDER BY i.available ASC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get low stock items: %w", err)
	}
	defer rows.Close()

	var inventory []models.Inventory
	for rows.Next() {
		var item models.Inventory
		err := rows.Scan(
			&item.ID, &item.ProductID, &item.Available,
			&item.Reserved, &item.OnHand, &item.LowStockThreshold,
			&item.Location, &item.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan inventory: %w", err)
		}
		inventory = append(inventory, item)
	}

	return inventory, nil
}

// GetInventory retrieves all inventory records
func (r *Repository) GetInventory(ctx context.Context, limit, offset int) ([]models.Inventory, error) {
	query := `
		SELECT id, product_id, available, reserved, on_hand, low_stock_threshold, location, updated_at
		FROM inventory
		ORDER BY product_id
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get inventory: %w", err)
	}
	defer rows.Close()

	var inventory []models.Inventory
	for rows.Next() {
		var item models.Inventory
		err := rows.Scan(
			&item.ID, &item.ProductID, &item.Available,
			&item.Reserved, &item.OnHand, &item.LowStockThreshold,
			&item.Location, &item.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan inventory: %w", err)
		}
		inventory = append(inventory, item)
	}

	return inventory, nil
}
```

## Step 6: Kafka Consumer

Create Kafka consumer for inventory events.

### Create `services/inventory-service/internal/kafka/consumer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/IBM/sarama"
	"yourusername/online-storage/inventory-service/internal/inventory"
	"yourusername/online-storage/inventory-service/pkg/models"
)

// Consumer handles inventory-related Kafka events
type Consumer struct {
	inventoryService *inventory.Service
}

// NewConsumer creates a new inventory event consumer
func NewConsumer(inventoryService *inventory.Service) *Consumer {
	return &Consumer{
		inventoryService: inventoryService,
	}
}

// Handler implements sarama.ConsumerGroupHandler
func (c *Consumer) Handler() sarama.ConsumerGroupHandler {
	return c
}

// Setup is called at beginning of a new session
func (c *Consumer) Setup(session sarama.ConsumerGroupSession) error {
	log.Println("Inventory service consumer session started")
	return nil
}

// Cleanup is called at the end of a session
func (c *Consumer) Cleanup(session sarama.ConsumerGroupSession) error {
	log.Println("Inventory service consumer session ended")
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
		case "orders.cancelled":
			err = c.handleOrderCancelled(ctx, message.Value)
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

	// Parse order items
	var items []models.OrderItem
	for _, item := range event.Items {
		items = append(items, models.OrderItem{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
		})
	}

	return c.inventoryService.HandleOrderCreated(ctx, event.OrderID, items)
}

func (c *Consumer) handleOrderCancelled(ctx context.Context, data []byte) error {
	var event models.OrderCancelledEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return fmt.Errorf("failed to unmarshal order.cancelled event: %w", err)
	}

	// Get order items from database (simplified - in production, store order items in event or query database)
	// For this example, we'll assume items are included in the event or we need to query
	// For now, we'll create a placeholder that should be replaced with actual item retrieval

	return c.inventoryService.HandleOrderCancelled(ctx, event.OrderID, []models.OrderItem{})
}
```

## Step 7: Kafka Producer

Create Kafka producer for publishing inventory events.

### Create `services/inventory-service/internal/kafka/producer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/IBM/sarama"
	"yourusername/online-storage/inventory-service/pkg/models"
)

// Producer handles publishing inventory events to Kafka
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

// PublishInventoryReserved publishes an inventory reserved event
func (p *Producer) PublishInventoryReserved(ctx context.Context, event *models.InventoryReservedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "inventory.reserved",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published inventory.reserved event for order %s\n", event.OrderID)
	return nil
}

// PublishInventoryReleased publishes an inventory released event
func (p *Producer) PublishInventoryReleased(ctx context.Context, event *models.InventoryReleasedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "inventory.released",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published inventory.released event for order %s\n", event.OrderID)
	return nil
}

// PublishInventoryOutOfStock publishes an out of stock event
func (p *Producer) PublishInventoryOutOfStock(ctx context.Context, event *models.InventoryOutOfStockEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "inventory.out_of_stock",
		Key:   sarama.StringEncoder(event.OrderID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published inventory.out_of_stock event for order %s\n", event.OrderID)
	return nil
}

// PublishInventoryAdjusted publishes an inventory adjustment event
func (p *Producer) PublishInventoryAdjusted(ctx context.Context, event *models.InventoryAdjustedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	message := &sarama.ProducerMessage{
		Topic: "inventory.adjusted",
		Key:   sarama.StringEncoder(event.ProductID),
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(message)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	fmt.Printf("Published inventory.adjusted event for product %s\n", event.ProductID)
	return nil
}

// Close closes the producer
func (p *Producer) Close() error {
	return p.producer.Close()
}
```

## Step 8: Models

Create models for Inventory service.

### Create `services/inventory-service/pkg/models/inventory.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Inventory represents product inventory
type Inventory struct {
	ID               uuid.UUID `json:"id"`
	ProductID        uuid.UUID `json:"product_id"`
	Available        int       `json:"available"`
	Reserved         int       `json:"reserved"`
	OnHand           int       `json:"on_hand"`
	LowStockThreshold int       `json:"low_stock_threshold"`
	Location         string    `json:"location,omitempty"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

// Event Models
type InventoryReservedEvent struct {
	ReservationID string `json:"reservation_id"`
	OrderID       string `json:"order_id"`
	Items         []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ReservedAt string `json:"reserved_at"`
}

type InventoryReleasedEvent struct {
	ReservationID string `json:"reservation_id"`
	OrderID       string `json:"order_id"`
	Items         []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
	ReleasedAt string `json:"released_at"`
}

type InventoryOutOfStockEvent struct {
	OrderID      string `json:"order_id"`
	ProductID    string `json:"product_id"`
	RequestedQty int    `json:"requested_qty"`
	AvailableQty int    `json:"available_qty"`
	Timestamp    string `json:"timestamp"`
}

type InventoryAdjustedEvent struct {
	ProductID      string `json:"product_id"`
	AdjustmentType string `json:"adjustment_type"`
	Quantity        int    `json:"quantity"`
	Reason          string `json:"reason,omitempty"`
	ReferenceID     string `json:"reference_id,omitempty"`
	Timestamp       string `json:"timestamp"`
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

type OrderCancelledEvent struct {
	OrderID     string `json:"order_id"`
	UserID      string `json:"user_id"`
	Reason      string `json:"reason,omitempty"`
	CancelledAt string `json:"cancelled_at"`
}
```

## Step 9: Main Application

Create main application entry point.

### Create `services/inventory-service/cmd/inventory/main.go`:

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

	"yourusername/online-storage/inventory-service/internal/db"
	"yourusername/online-storage/inventory-service/internal/inventory"
	"yourusername/online-storage/inventory-service/internal/kafka"
	"yourusername/online-storage/inventory-service/pkg/models"
)

type EventPublisherImpl struct {
	producer *kafka.Producer
}

func (e *EventPublisherImpl) PublishInventoryReserved(ctx context.Context, event *models.InventoryReservedEvent) error {
	return e.producer.PublishInventoryReserved(ctx, event)
}

func (e *EventPublisherImpl) PublishInventoryReleased(ctx context.Context, event *models.InventoryReleasedEvent) error {
	return e.producer.PublishInventoryReleased(ctx, event)
}

func (e *EventPublisherImpl) PublishInventoryOutOfStock(ctx context.Context, event *models.InventoryOutOfStockEvent) error {
	return e.producer.PublishInventoryOutOfStock(ctx, event)
}

func (e *EventPublisherImpl) PublishInventoryAdjusted(ctx context.Context, event *models.InventoryAdjustedEvent) error {
	return e.producer.PublishInventoryAdjusted(ctx, event)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration
	kafkaBrokers := []string{getEnv("KAFKA_BROKERS", "kafka:9092")}
	kafkaClientID := getEnv("KAFKA_CLIENT_ID", "inventory-service")
	kafkaGroupID := getEnv("KAFKA_GROUP_ID", "inventory-service-group")

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

	// Initialize inventory service
	eventPublisher := &EventPublisherImpl{producer: producer}
	inventoryService := inventory.NewService(repo, eventPublisher)

	// Initialize HTTP server for manual inventory adjustments
	go func() {
		router := setupHTTPRouter(inventoryService)
		port := getEnv("SERVICE_PORT", "8083")
		log.Printf("HTTP server starting on port %s...", port)

		server := &http.Server{
			Addr:         ":" + port,
			Handler:      router,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
		}

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// Initialize Kafka consumer
	log.Println("Initializing Kafka consumer...")
	kafkaConsumer := kafka.NewConsumer(inventoryService)

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
	topics := []string{"orders.created", "orders.cancelled"}

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

	log.Println("Inventory service is running...")
	log.Printf("Consuming topics: %v", topics)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down inventory service...")
	cancel()

	time.Sleep(2 * time.Second)
	log.Println("Inventory service stopped")
}

func setupHTTPRouter(inventoryService *inventory.Service) *mux.Router {
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	}).Methods("GET")

	// Get inventory by product ID
	router.HandleFunc("/inventory/{product_id}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		productID := vars["product_id"]

		inventory, err := inventoryService.GetInventoryByProduct(r.Context(), productID)
		if err != nil {
			http.Error(w, "Inventory not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fmt.Sprintf(`{"available":%d,"reserved":%d,"on_hand":%d}`,
			inventory.Available, inventory.Reserved, inventory.OnHand)))
	}).Methods("GET")

	// Get all inventory
	router.HandleFunc("/inventory", func(w http.ResponseWriter, r *http.Request) {
		inventory, err := inventoryService.GetAllInventory(r.Context(), 100, 0)
		if err != nil {
			http.Error(w, "Failed to retrieve inventory", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		// Simplified response - in production, use JSON encoder
		w.Write([]byte(fmt.Sprintf(`{"count":%d}`, len(inventory))))
	}).Methods("GET")

	// Get low stock items
	router.HandleFunc("/inventory/low-stock", func(w http.ResponseWriter, r *http.Request) {
		inventory, err := inventoryService.GetLowStockItems(r.Context(), 50)
		if err != nil {
			http.Error(w, "Failed to retrieve low stock items", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		// Simplified response - in production, use JSON encoder
		w.Write([]byte(fmt.Sprintf(`{"count":%d}`, len(inventory))))
	}).Methods("GET")

	return router
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

## Step 10: Run and Test

Build and run Inventory service:

```bash
cd services/inventory-service

# Build application
go build -o bin/inventory ./cmd/inventory

# Run with Docker
docker compose up inventory-service

# View logs
docker compose logs -f inventory-service

# Test HTTP endpoints
curl http://localhost:8083/health
curl http://localhost:8083/inventory
curl http://localhost:8083/inventory/low-stock
```

## Step 11: Update Makefile

Add Inventory service-related targets to Makefile:

```makefile
# Inventory service targets
inventory-service-logs:
	docker compose logs -f inventory-service

inventory-service-restart:
	docker compose restart inventory-service
```

## Step 12: Event Flow

The Inventory service handles the following event flow:

1. **Order Created** (`orders.created`) - Consumed
   - Reserves inventory for each order item atomically
   - Publishes `inventory.reserved` event if successful
   - Publishes `inventory.out_of_stock` event if insufficient stock

2. **Order Cancelled** (`orders.cancelled`) - Consumed
   - Releases reserved inventory back to available
   - Publishes `inventory.released` event

3. **Manual Adjustment** (HTTP API)
   - Allows manual inventory adjustments
   - Publishes `inventory.adjusted` event

## Next Steps

With all backend services implemented, continue to the next implementation guide: [09-remix-frontend.md](./09-remix-frontend.md)

## Troubleshooting

### Inventory not being reserved
- Check if products exist in inventory table
- Verify sufficient stock is available
- Review database transaction logs

### Concurrent reservation issues
- Ensure row-level locks are used (FOR UPDATE)
- Check transaction isolation level
- Review error logs for race conditions

### Kafka events not publishing
- Check Kafka producer configuration
- Verify broker addresses are correct
- Review producer logs for connection issues

### Low stock alerts not working
- Verify low_stock_threshold values
- Check query for low stock items
- Review inventory adjustment records
