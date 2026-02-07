package repo

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (r *Postgres) Create(ctx context.Context, userID uuid.UUID, input CreateOrderInput) (*Order, error) {
	if len(input.Items) == 0 {
		return nil, errors.New("order must include at least one item")
	}
	if strings.TrimSpace(input.ShippingAddressText) == "" {
		return nil, errors.New("shipping_address_text is required")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	type productSnapshot struct {
		id    uuid.UUID
		name  string
		sku   string
		price float64
	}

	snapshots := make([]productSnapshot, 0, len(input.Items))
	subtotal := 0.0

	for _, item := range input.Items {
		if item.Quantity <= 0 {
			return nil, errors.New("quantity must be > 0")
		}
		row := tx.QueryRow(ctx, `
			SELECT id, name, sku, price::float8
			FROM products
			WHERE id = $1 AND deleted_at IS NULL AND is_active = true
		`, item.ProductID)

		var s productSnapshot
		if err := row.Scan(&s.id, &s.name, &s.sku, &s.price); err != nil {
			return nil, err
		}
		snapshots = append(snapshots, s)
		subtotal += s.price * float64(item.Quantity)
	}

	tax := 0.0
	total := subtotal + tax
	currency := "USD"

	var order Order
	row := tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, status, subtotal, tax, total, currency, customer_notes, shipping_address_text)
		VALUES ($1, 'payment_required', $2, $3, $4, $5, $6, $7)
		RETURNING id, user_id, status, subtotal::float8, tax::float8, total::float8, currency, COALESCE(customer_notes, ''), shipping_address_text, created_at, updated_at
	`, userID, subtotal, tax, total, currency, input.CustomerNotes, input.ShippingAddressText)

	if err := row.Scan(
		&order.ID,
		&order.UserID,
		&order.Status,
		&order.Subtotal,
		&order.Tax,
		&order.Total,
		&order.Currency,
		&order.CustomerNotes,
		&order.ShippingAddressText,
		&order.CreatedAt,
		&order.UpdatedAt,
	); err != nil {
		return nil, err
	}

	order.Items = make([]OrderItem, 0, len(input.Items))
	for i, item := range input.Items {
		s := snapshots[i]
		unitPrice := s.price
		totalPrice := unitPrice * float64(item.Quantity)

		var oi OrderItem
		row := tx.QueryRow(ctx, `
			INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id, order_id, product_id, product_name, product_sku, quantity, unit_price::float8, total_price::float8, created_at
		`, order.ID, s.id, s.name, s.sku, item.Quantity, unitPrice, totalPrice)

		if err := row.Scan(
			&oi.ID,
			&oi.OrderID,
			&oi.ProductID,
			&oi.ProductName,
			&oi.ProductSKU,
			&oi.Quantity,
			&oi.UnitPrice,
			&oi.TotalPrice,
			&oi.CreatedAt,
		); err != nil {
			return nil, err
		}
		order.Items = append(order.Items, oi)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &order, nil
}

func (r *Postgres) GetByIDForUser(ctx context.Context, orderID, userID uuid.UUID) (*Order, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, status, subtotal::float8, tax::float8, total::float8, currency, COALESCE(customer_notes, ''), shipping_address_text, created_at, updated_at
		FROM orders
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, orderID, userID)

	var order Order
	if err := row.Scan(
		&order.ID,
		&order.UserID,
		&order.Status,
		&order.Subtotal,
		&order.Tax,
		&order.Total,
		&order.Currency,
		&order.CustomerNotes,
		&order.ShippingAddressText,
		&order.CreatedAt,
		&order.UpdatedAt,
	); err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, order_id, product_id, product_name, product_sku, quantity, unit_price::float8, total_price::float8, created_at
		FROM order_items
		WHERE order_id = $1
		ORDER BY created_at ASC
	`, order.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]OrderItem, 0)
	for rows.Next() {
		var oi OrderItem
		if err := rows.Scan(
			&oi.ID,
			&oi.OrderID,
			&oi.ProductID,
			&oi.ProductName,
			&oi.ProductSKU,
			&oi.Quantity,
			&oi.UnitPrice,
			&oi.TotalPrice,
			&oi.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, oi)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	order.Items = items

	return &order, nil
}
