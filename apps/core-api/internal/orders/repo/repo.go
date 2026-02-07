package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Order struct {
	ID                  uuid.UUID   `json:"id"`
	UserID              *uuid.UUID  `json:"user_id,omitempty"`
	Status              string      `json:"status"`
	Subtotal            float64     `json:"subtotal"`
	Tax                 float64     `json:"tax"`
	Total               float64     `json:"total"`
	Currency            string      `json:"currency"`
	CustomerNotes       string      `json:"customer_notes,omitempty"`
	ShippingAddressText string      `json:"shipping_address_text,omitempty"`
	Items               []OrderItem `json:"items,omitempty"`
	CreatedAt           time.Time   `json:"created_at"`
	UpdatedAt           time.Time   `json:"updated_at"`
}

type OrderItem struct {
	ID          uuid.UUID `json:"id"`
	OrderID     uuid.UUID `json:"order_id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	ProductSKU  string    `json:"product_sku"`
	Quantity    int       `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
	TotalPrice  float64   `json:"total_price"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateOrderItemInput struct {
	ProductID uuid.UUID `json:"product_id"`
	Quantity  int       `json:"quantity"`
}

type CreateOrderInput struct {
	CustomerNotes       string                 `json:"customer_notes,omitempty"`
	ShippingAddressText string                 `json:"shipping_address_text"`
	Items               []CreateOrderItemInput `json:"items"`
}

type Repository interface {
	Create(ctx context.Context, userID uuid.UUID, input CreateOrderInput) (*Order, error)
	GetByIDForUser(ctx context.Context, orderID, userID uuid.UUID) (*Order, error)
}
