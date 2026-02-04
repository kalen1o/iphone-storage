# Core API Service Implementation

This guide implements the Core API service, which is the primary HTTP surface for the frontend application. It handles users, products, carts, and orders, and emits events to Kafka for downstream processing.

## Step 1: Initialize Go Module

Create and initialize the Core API service:

```bash
cd services/core-api

# Initialize Go module
go mod init github.com/yourusername/online-storage/core-api

# Add dependencies
go get github.com/gorilla/mux
go get github.com/jackc/pgx/v5
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto/bcrypt
go get github.com/IBM/sarama
go get github.com/go-redis/redis/v8
go get github.com/google/uuid
go get github.com/rs/cors
```

## Step 2: Project Structure

Create the directory structure:

```bash
cd services/core-api

mkdir -p cmd/api
mkdir -p internal/http/{handlers,middleware}
mkdir -p internal/user
mkdir -p internal/product
mkdir -p internal/order
mkdir -p internal/cart
mkdir -p internal/auth
mkdir -p internal/kafka
mkdir -p internal/db
mkdir -p pkg/{models,utils}
```

## Step 3: Dockerfile

Create the Dockerfile for the Core API service.

### Create `services/core-api/Dockerfile`:

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

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/api ./cmd/api

# Runtime stage
FROM alpine:3.18

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/bin/api /app/api

# Set timezone
ENV TZ=UTC

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
CMD ["/app/api"]
```

### Create `services/core-api/.dockerignore`:

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

## Step 4: Data Models

Create data models for the Core API.

### Create `services/core-api/pkg/models/user.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a user in the system
type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	FirstName    string    `json:"first_name,omitempty" db:"first_name"`
	LastName     string    `json:"last_name,omitempty" db:"last_name"`
	Role         string    `json:"role" db:"role"`
	IsActive     bool      `json:"is_active" db:"is_active"`
	EmailVerified bool     `json:"email_verified" db:"email_verified"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// CreateUserRequest represents a request to create a user
type CreateUserRequest struct {
	Email     string `json:"email" validate:"required,email"`
	Password  string `json:"password" validate:"required,min=8"`
	FirstName string `json:"first_name" validate:"required"`
	LastName  string `json:"last_name" validate:"required"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// UpdateUserRequest represents a request to update a user
type UpdateUserRequest struct {
	FirstName *string `json:"first_name,omitempty"`
	LastName  *string `json:"last_name,omitempty"`
}
```

### Create `services/core-api/pkg/models/product.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Product represents a product in the system
type Product struct {
	ID             uuid.UUID              `json:"id" db:"id"`
	Name           string                 `json:"name" db:"name"`
	Description    string                 `json:"description,omitempty" db:"description"`
	SKU            string                 `json:"sku" db:"sku"`
	Price          float64                `json:"price" db:"price"`
	CompareAtPrice *float64              `json:"compare_at_price,omitempty" db:"compare_at_price"`
	Category       string                 `json:"category,omitempty" db:"category"`
	Images         []string               `json:"images" db:"images"`
	Metadata       map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	IsActive       bool                   `json:"is_active" db:"is_active"`
	IsDigital      bool                   `json:"is_digital" db:"is_digital"`
	CreatedAt      time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at" db:"updated_at"`
}

// CreateProductRequest represents a request to create a product
type CreateProductRequest struct {
	Name           string                 `json:"name" validate:"required"`
	Description    string                 `json:"description,omitempty"`
	SKU            string                 `json:"sku" validate:"required"`
	Price          float64                `json:"price" validate:"required,gt=0"`
	CompareAtPrice *float64              `json:"compare_at_price,omitempty"`
	Category       string                 `json:"category,omitempty"`
	Images         []string               `json:"images,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	IsDigital      bool                   `json:"is_digital,omitempty"`
}

// UpdateProductRequest represents a request to update a product
type UpdateProductRequest struct {
	Name           *string                 `json:"name,omitempty"`
	Description    *string                 `json:"description,omitempty"`
	Price          *float64                `json:"price,omitempty" validate:"omitempty,gt=0"`
	CompareAtPrice *float64                `json:"compare_at_price,omitempty"`
	Category       *string                 `json:"category,omitempty"`
	Images         []string                `json:"images,omitempty"`
	Metadata       map[string]interface{}  `json:"metadata,omitempty"`
	IsActive       *bool                   `json:"is_active,omitempty"`
}
```

### Create `services/core-api/pkg/models/order.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Order represents an order in the system
type Order struct {
	ID            uuid.UUID              `json:"id" db:"id"`
	UserID        uuid.UUID              `json:"user_id" db:"user_id"`
	Status        string                 `json:"status" db:"status"`
	Subtotal      float64                `json:"subtotal" db:"subtotal"`
	Tax           float64                `json:"tax" db:"tax"`
	Total         float64                `json:"total" db:"total"`
	Currency      string                 `json:"currency" db:"currency"`
	CustomerNotes string                 `json:"customer_notes,omitempty" db:"customer_notes"`
	Items         []OrderItem            `json:"items" db:"-"`
	Metadata      map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt     time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at" db:"updated_at"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ID          uuid.UUID `json:"id" db:"id"`
	OrderID     uuid.UUID `json:"order_id" db:"order_id"`
	ProductID   uuid.UUID `json:"product_id" db:"product_id"`
	ProductName string    `json:"product_name" db:"product_name"`
	ProductSKU  string    `json:"product_sku" db:"product_sku"`
	Quantity    int       `json:"quantity" db:"quantity"`
	UnitPrice   float64   `json:"unit_price" db:"unit_price"`
	TotalPrice  float64   `json:"total_price" db:"total_price"`
}

// CreateOrderRequest represents a request to create an order
type CreateOrderRequest struct {
	Items []CreateOrderItemRequest `json:"items" validate:"required,min=1,dive"`
	CustomerNotes string           `json:"customer_notes,omitempty"`
}

// CreateOrderItemRequest represents an item in a create order request
type CreateOrderItemRequest struct {
	ProductID uuid.UUID `json:"product_id" validate:"required"`
	Quantity  int       `json:"quantity" validate:"required,min=1"`
}

// CartItem represents an item in a shopping cart
type CartItem struct {
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	ProductSKU  string    `json:"product_sku"`
	Quantity    int       `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
	TotalPrice  float64   `json:"total_price"`
}

// AddToCartRequest represents a request to add an item to the cart
type AddToCartRequest struct {
	ProductID uuid.UUID `json:"product_id" validate:"required"`
	Quantity  int       `json:"quantity" validate:"required,min=1"`
}
```

## Step 5: Database Repository

Create a database repository for the Core API.

### Create `services/core-api/internal/db/repository.go`:

```go
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"yourusername/online-storage/core-api/pkg/models"
)

// Repository handles database operations
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ============================================================================

// CreateUser creates a new user
func (r *Repository) CreateUser(ctx context.Context, user *models.User, passwordHash string) error {
	query := `
		INSERT INTO users (email, password_hash, first_name, last_name, role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`
	err := r.pool.QueryRow(
		ctx,
		query,
		user.Email,
		passwordHash,
		user.FirstName,
		user.LastName,
		user.Role,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)

	return err
}

// GetUserByEmail retrieves a user by email
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, string, error) {
	var user models.User
	var passwordHash string

	query := `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, email_verified, created_at, updated_at
		FROM users
		WHERE email = $1 AND deleted_at IS NULL
	`
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.Email, &passwordHash, &user.FirstName, &user.LastName,
		&user.Role, &user.IsActive, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		return nil, "", err
	}

	return &user, passwordHash, nil
}

// GetUserByID retrieves a user by ID
func (r *Repository) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User

	query := `
		SELECT id, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.Email, &user.FirstName, &user.LastName,
		&user.Role, &user.IsActive, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

// ============================================================================

// CreateProduct creates a new product
func (r *Repository) CreateProduct(ctx context.Context, product *models.Product) error {
	query := `
		INSERT INTO products (name, description, sku, price, compare_at_price, category, images, metadata, is_digital)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`
	err := r.pool.QueryRow(
		ctx,
		query,
		product.Name, product.Description, product.SKU, product.Price,
		product.CompareAtPrice, product.Category, product.Images, product.Metadata, product.IsDigital,
	).Scan(&product.ID, &product.CreatedAt, &product.UpdatedAt)

	return err
}

// GetProducts retrieves a list of products
func (r *Repository) GetProducts(ctx context.Context, limit, offset int) ([]models.Product, error) {
	query := `
		SELECT id, name, description, sku, price, compare_at_price, category, images, metadata, is_active, is_digital, created_at, updated_at
		FROM products
		WHERE is_active = true AND deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var product models.Product
		err := rows.Scan(
			&product.ID, &product.Name, &product.Description, &product.SKU,
			&product.Price, &product.CompareAtPrice, &product.Category,
			&product.Images, &product.Metadata, &product.IsActive, &product.IsDigital,
			&product.CreatedAt, &product.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}

	return products, nil
}

// GetProductByID retrieves a product by ID
func (r *Repository) GetProductByID(ctx context.Context, id string) (*models.Product, error) {
	var product models.Product

	query := `
		SELECT id, name, description, sku, price, compare_at_price, category, images, metadata, is_active, is_digital, created_at, updated_at
		FROM products
		WHERE id = $1 AND deleted_at IS NULL
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&product.ID, &product.Name, &product.Description, &product.SKU,
		&product.Price, &product.CompareAtPrice, &product.Category,
		&product.Images, &product.Metadata, &product.IsActive, &product.IsDigital,
		&product.CreatedAt, &product.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &product, nil
}

// ============================================================================

// CreateOrder creates a new order
func (r *Repository) CreateOrder(ctx context.Context, order *models.Order, items []models.OrderItem) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Insert order
	orderQuery := `
		INSERT INTO orders (user_id, status, subtotal, tax, total, currency, customer_notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	err = tx.QueryRow(
		ctx,
		orderQuery,
		order.UserID, order.Status, order.Subtotal, order.Tax, order.Total,
		order.Currency, order.CustomerNotes,
	).Scan(&order.ID, &order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		return err
	}

	// Insert order items
	for i := range items {
		items[i].OrderID = order.ID
		itemQuery := `
			INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`
		err = tx.QueryRow(
			ctx,
			itemQuery,
			items[i].OrderID, items[i].ProductID, items[i].ProductName, items[i].ProductSKU,
			items[i].Quantity, items[i].UnitPrice, items[i].TotalPrice,
		).Scan(&items[i].ID)

		if err != nil {
			return fmt.Errorf("failed to insert order item: %w", err)
		}
	}

	order.Items = items

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	tx = nil

	return nil
}

// GetOrderByID retrieves an order by ID
func (r *Repository) GetOrderByID(ctx context.Context, id string, userID string) (*models.Order, error) {
	var order models.Order

	query := `
		SELECT id, user_id, status, subtotal, tax, total, currency, customer_notes, metadata, created_at, updated_at
		FROM orders
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(
		&order.ID, &order.UserID, &order.Status, &order.Subtotal, &order.Tax,
		&order.Total, &order.Currency, &order.CustomerNotes, &order.Metadata,
		&order.CreatedAt, &order.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Load order items
	itemsQuery := `
		SELECT id, product_id, product_name, product_sku, quantity, unit_price, total_price
		FROM order_items
		WHERE order_id = $1
		ORDER BY id
	`
	rows, err := r.pool.Query(ctx, itemsQuery, order.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.OrderItem
		err := rows.Scan(
			&item.ID, &item.ProductID, &item.ProductName, &item.ProductSKU,
			&item.Quantity, &item.UnitPrice, &item.TotalPrice,
		)
		if err != nil {
			return nil, err
		}
		order.Items = append(order.Items, item)
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
	_, err := r.pool.Exec(ctx, query, status, orderID)
	return err
}
```

## Step 6: HTTP Handlers

Create HTTP handlers for the API endpoints.

### Create `services/core-api/internal/http/handlers/health.go`:

```go
package handlers

import (
	"encoding/json"
	"net/http"
	"time"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC(),
		"service":   "core-api",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func (h *HealthHandler) Version(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"version": "1.0.0",
		"service": "core-api",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
```

### Create `services/core-api/internal/http/handlers/product.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"yourusername/online-storage/core-api/internal/db"
	"yourusername/online-storage/core-api/pkg/models"
)

type ProductHandler struct {
	repo *db.Repository
}

func NewProductHandler(repo *db.Repository) *ProductHandler {
	return &ProductHandler{repo: repo}
}

// GetProducts returns a list of products
func (h *ProductHandler) GetProducts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse query parameters
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Get products
	products, err := h.repo.GetProducts(ctx, limit, offset)
	if err != nil {
		http.Error(w, "Failed to retrieve products", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"products": products,
		"limit":    limit,
		"offset":   offset,
	})
}

// GetProductByID returns a single product by ID
func (h *ProductHandler) GetProductByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	productID := vars["id"]

	product, err := h.repo.GetProductByID(ctx, productID)
	if err != nil {
		http.Error(w, "Product not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(product)
}
```

### Create `services/core-api/internal/http/handlers/auth.go`:

```go
package handlers

import (
	"encoding/json"
	"net/http"

	"yourusername/online-storage/core-api/internal/auth"
	"yourusername/online-storage/core-api/internal/db"
	"yourusername/online-storage/core-api/pkg/models"
)

type AuthHandler struct {
	repo      *db.Repository
	auth      *auth.Service
}

func NewAuthHandler(repo *db.Repository, auth *auth.Service) *AuthHandler {
	return &AuthHandler{repo: repo, auth: auth}
}

// Register creates a new user account
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Hash password
	passwordHash, err := h.auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "Failed to process password", http.StatusInternalServerError)
		return
	}

	// Create user
	user := &models.User{
		Email:        req.Email,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         "customer",
		IsActive:     true,
		EmailVerified: false,
	}

	if err := h.repo.CreateUser(r.Context(), user, passwordHash); err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Generate JWT token
	token, err := h.auth.GenerateToken(user.ID.String(), user.Email, user.Role)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Return user and token
	response := map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":            user.ID,
			"email":         user.Email,
			"first_name":    user.FirstName,
			"last_name":     user.LastName,
			"role":          user.Role,
			"is_active":     user.IsActive,
			"email_verified": user.EmailVerified,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// Login authenticates a user
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user by email
	user, passwordHash, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Verify password
	if !h.auth.VerifyPassword(req.Password, passwordHash) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Check if user is active
	if !user.IsActive {
		http.Error(w, "Account is inactive", http.StatusForbidden)
		return
	}

	// Generate JWT token
	token, err := h.auth.GenerateToken(user.ID.String(), user.Email, user.Role)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":            user.ID,
			"email":         user.Email,
			"first_name":    user.FirstName,
			"last_name":     user.LastName,
			"role":          user.Role,
			"is_active":     user.IsActive,
			"email_verified": user.EmailVerified,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
```

### Create `services/core-api/internal/http/handlers/order.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/google/uuid"
	"yourusername/online-storage/core-api/internal/db"
	"yourusername/online-storage/core-api/pkg/models"
)

type OrderHandler struct {
	repo      *db.Repository
}

func NewOrderHandler(repo *db.Repository) *OrderHandler {
	return &OrderHandler{repo: repo}
}

// CreateOrder creates a new order
func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get user ID from context (set by auth middleware)
	userID := r.Context().Value("user_id").(string)

	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate and process order items
	var items []models.OrderItem
	var subtotal float64

	for _, item := range items {
		// Get product details
		product, err := h.repo.GetProductByID(ctx, item.ProductID.String())
		if err != nil {
			http.Error(w, "Product not found", http.StatusNotFound)
			return
		}

		orderItem := models.OrderItem{
			ProductID:   item.ProductID,
			ProductName: product.Name,
			ProductSKU:  product.SKU,
			Quantity:    item.Quantity,
			UnitPrice:   product.Price,
			TotalPrice:  product.Price * float64(item.Quantity),
		}
		items = append(items, orderItem)
		subtotal += orderItem.TotalPrice
	}

	// Calculate tax and total (simplified)
	tax := subtotal * 0.10 // 10% tax rate
	total := subtotal + tax

	// Create order
	order := &models.Order{
		UserID:        uuid.MustParse(userID),
		Status:        "payment_required",
		Subtotal:      subtotal,
		Tax:           tax,
		Total:         total,
		Currency:      "USD",
		CustomerNotes: req.CustomerNotes,
	}

	if err := h.repo.CreateOrder(ctx, order, items); err != nil {
		http.Error(w, "Failed to create order", http.StatusInternalServerError)
		return
	}

	// Publish order.created event to Kafka
	// (Implementation depends on your Kafka integration)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order)
}

// GetOrder retrieves an order by ID
func (h *OrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	orderID := vars["id"]

	// Get user ID from context
	userID := r.Context().Value("user_id").(string)

	order, err := h.repo.GetOrderByID(ctx, orderID, userID)
	if err != nil {
		http.Error(w, "Order not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(order)
}
```

## Step 7: Middleware

Create middleware for authentication and CORS.

### Create `services/core-api/internal/http/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"net/http"
	"strings"

	"yourusername/online-storage/core-api/internal/auth"
)

type AuthMiddleware struct {
	auth *auth.Service
}

func NewAuthMiddleware(auth *auth.Service) *AuthMiddleware {
	return &AuthMiddleware{auth: auth}
}

// Authenticate validates JWT token and adds user info to context
func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Extract token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		token := parts[1]

		// Validate token
		claims, err := m.auth.ValidateToken(token)
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Add user info to context
		ctx := context.WithValue(r.Context(), "user_id", claims.UserID)
		ctx = context.WithValue(ctx, "email", claims.Email)
		ctx = context.WithValue(ctx, "role", claims.Role)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole checks if user has required role
func (m *AuthMiddleware) RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRole := r.Context().Value("role").(string)

			if userRole != role && userRole != "admin" {
				http.Error(w, "Insufficient permissions", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
```

### Create `services/core-api/internal/http/middleware/cors.go`:

```go
package middleware

import (
	"net/http"

	"github.com/rs/cors"
)

func CORS() func(http.Handler) http.Handler {
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "https://localhost"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Correlation-ID", "Authorization"},
		ExposedHeaders:   []string{"X-Correlation-ID"},
		AllowCredentials: true,
		MaxAge:          300,
	})

	return func(next http.Handler) http.Handler {
		return c.Handler(next)
	}
}
```

### Create `services/core-api/internal/http/middleware/logging.go`:

```go
package middleware

import (
	"log"
	"time"
)

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Log request
		log.Printf("%s %s %s", r.Method, r.RequestURI, r.RemoteAddr)

		// Call next handler
		next.ServeHTTP(w, r)

		// Log response time
		log.Printf("%s %s completed in %v", r.Method, r.RequestURI, time.Since(start))
	})
}
```

## Step 8: Authentication Service

Create JWT authentication service.

### Create `services/core-api/internal/auth/auth.go`:

```go
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	secretKey string
	jwtExpiry time.Duration
}

type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func NewService(secretKey string, jwtExpiry time.Duration) *Service {
	return &Service{
		secretKey: secretKey,
		jwtExpiry: jwtExpiry,
	}
}

func (s *Service) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func (s *Service) VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (s *Service) GenerateToken(userID, email, role string) (string, error) {
	claims := &Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.secretKey))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return []byte(s.secretKey), nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
```

## Step 9: Main Application

Create the main application entry point.

### Create `services/core-api/cmd/api/main.go`:

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

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"

	"yourusername/online-storage/core-api/internal/auth"
	"yourusername/online-storage/core-api/internal/db"
	"yourusername/online-storage/core-api/internal/http/handlers"
	"yourusername/online-storage/core-api/internal/http/middleware"
)

func main() {
	// Load configuration
	// (Load from environment variables or config file)

	// Connect to database
	dbDSN := os.Getenv("DB_DSN")
	if dbDSN == "" {
		dbDSN = "host=postgres port=5432 user=admin password=secret dbname=online_storage sslmode=disable"
	}

	pool, err := pgxpool.New(context.Background(), dbDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Initialize repository
	repo := db.NewRepository(pool)

	// Initialize auth service
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "change-me-in-production"
	}
	jwtExpiry := 24 * time.Hour
	authService := auth.NewService(jwtSecret, jwtExpiry)

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler()
	productHandler := handlers.NewProductHandler(repo)
	authHandler := handlers.NewAuthHandler(repo, authService)
	orderHandler := handlers.NewOrderHandler(repo)

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(authService)
	loggingMiddleware := middleware.Logging
	corsMiddleware := middleware.CORS()

	// Setup router
	router := mux.NewRouter()

	// Apply middleware to all routes
	router.Use(loggingMiddleware)
	router.Use(corsMiddleware)

	// Health endpoints
	router.HandleFunc("/health", healthHandler.Health).Methods("GET")
	router.HandleFunc("/version", healthHandler.Version).Methods("GET")

	// API routes
	api := router.PathPrefix("/api").Subrouter()

	// Auth routes (public)
	api.HandleFunc("/auth/register", authHandler.Register).Methods("POST")
	api.HandleFunc("/auth/login", authHandler.Login).Methods("POST")

	// Product routes (public)
	api.HandleFunc("/products", productHandler.GetProducts).Methods("GET")
	api.HandleFunc("/products/{id}", productHandler.GetProductByID).Methods("GET")

	// Protected routes
	protected := api.PathPrefix("").Subrouter()
	protected.Use(authMiddleware.Authenticate)

	// Order routes (protected)
	protected.HandleFunc("/orders", orderHandler.CreateOrder).Methods("POST")
	protected.HandleFunc("/orders/{id}", orderHandler.GetOrder).Methods("GET")

	// Server configuration
	port := os.Getenv("SERVICE_PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s...", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
```

## Step 10: Run and Test

Build and run the Core API service:

```bash
cd services/core-api

# Build the application
go build -o bin/api ./cmd/api

# Run the application
./bin/api

# Or run with Docker
docker compose up core-api

# Test the endpoints
curl http://localhost:8080/health
curl http://localhost:8080/version
curl http://localhost:8080/api/products
```

## Step 11: API Documentation

The Core API provides the following endpoints:

### Health Endpoints
- `GET /health` - Health check
- `GET /version` - Version information

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Products
- `GET /api/products` - List products (query: `limit`, `offset`)
- `GET /api/products/{id}` - Get product by ID

### Orders (Protected)
- `POST /api/orders` - Create order
- `GET /api/orders/{id}` - Get order by ID

## Next Steps

With the Core API implemented, continue to the next implementation guide: [06-order-service.md](./06-order-service.md)

## Troubleshooting

### Database connection failed
- Verify PostgreSQL is running: `docker compose ps postgres`
- Check connection string in environment variables
- Review network connectivity between containers

### JWT token validation failed
- Verify JWT_SECRET is set correctly
- Check token expiration time
- Ensure token is passed in Authorization header

### CORS errors
- Update allowed origins in CORS middleware
- Verify frontend origin matches configured values
- Check preflight OPTIONS requests

### 500 Internal Server Error
- Check application logs: `docker compose logs core-api`
- Review database queries for errors
- Verify all dependencies are properly initialized
