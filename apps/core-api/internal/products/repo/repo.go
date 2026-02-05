package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Product struct {
	ID          uuid.UUID      `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	SKU         string         `json:"sku"`
	Price       float64        `json:"price"`
	Category    string         `json:"category,omitempty"`
	Images      []string       `json:"images,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	IsActive    bool           `json:"is_active"`
	IsDigital   bool           `json:"is_digital"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type Repository interface {
	List(ctx context.Context, limit, offset int) ([]Product, error)
	GetByID(ctx context.Context, id uuid.UUID) (*Product, error)
}
