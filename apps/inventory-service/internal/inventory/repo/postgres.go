package repo

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrOutOfStock = errors.New("out of stock")

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

type OrderItem struct {
	ProductID uuid.UUID
	Quantity  int
}

func (r *Postgres) UpdateOrderStatusIf(ctx context.Context, orderID uuid.UUID, fromStatus, toStatus string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE orders
		SET status = $2, updated_at = NOW()
		WHERE id = $1 AND status = $3 AND deleted_at IS NULL
	`, orderID, toStatus, fromStatus)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Postgres) GetOrderStatus(ctx context.Context, orderID uuid.UUID) (string, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT status
		FROM orders
		WHERE id = $1 AND deleted_at IS NULL
	`, orderID)
	var status string
	if err := row.Scan(&status); err != nil {
		return "", err
	}
	return status, nil
}

func (r *Postgres) Reserve(ctx context.Context, orderID uuid.UUID, items []OrderItem) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, it := range items {
		if it.Quantity <= 0 {
			return errors.New("quantity must be > 0")
		}
		tag, err := tx.Exec(ctx, `
			WITH updated AS (
				UPDATE inventory
				SET available = available - $2, reserved = reserved + $2, updated_at = NOW()
				WHERE product_id = $1 AND available >= $2
				RETURNING product_id, available + $2 AS available_before, available AS available_after
			)
			INSERT INTO inventory_adjustments (product_id, adjustment_type, quantity, available_before, available_after, reason, reference_id)
			SELECT product_id, 'sale', $2, available_before, available_after, 'reserved for order', $3
			FROM updated
		`, it.ProductID, it.Quantity, orderID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return ErrOutOfStock
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

func (r *Postgres) GetOrderItems(ctx context.Context, orderID uuid.UUID) ([]OrderItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT product_id, quantity
		FROM order_items
		WHERE order_id = $1
		ORDER BY created_at ASC
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]OrderItem, 0)
	for rows.Next() {
		var it OrderItem
		if err := rows.Scan(&it.ProductID, &it.Quantity); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Postgres) Release(ctx context.Context, orderID uuid.UUID) error {
	items, err := r.GetOrderItems(ctx, orderID)
	if err != nil {
		return err
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, it := range items {
		if it.Quantity <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			UPDATE inventory
			SET available = available + $2,
			    reserved = GREATEST(reserved - $2, 0),
			    updated_at = NOW()
			WHERE product_id = $1
		`, it.ProductID, it.Quantity)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

func (r *Postgres) Finalize(ctx context.Context, orderID uuid.UUID) error {
	items, err := r.GetOrderItems(ctx, orderID)
	if err != nil {
		return err
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, it := range items {
		if it.Quantity <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			UPDATE inventory
			SET reserved = GREATEST(reserved - $2, 0),
			    on_hand = GREATEST(on_hand - $2, 0),
			    updated_at = NOW()
			WHERE product_id = $1
		`, it.ProductID, it.Quantity)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}
