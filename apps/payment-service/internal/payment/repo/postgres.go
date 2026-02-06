package repo

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotPaymentRequired = errors.New("order not payment_required")

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

type Order struct {
	ID       uuid.UUID
	Status   string
	Total    float64
	Currency string
}

func (r *Postgres) GetOrder(ctx context.Context, orderID uuid.UUID) (*Order, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, status, total::float8, currency
		FROM orders
		WHERE id = $1 AND deleted_at IS NULL
	`, orderID)
	var o Order
	if err := row.Scan(&o.ID, &o.Status, &o.Total, &o.Currency); err != nil {
		return nil, err
	}
	return &o, nil
}

type PaymentResult struct {
	PaymentID uuid.UUID
	Status    string
}

func (r *Postgres) CreateOrUpdatePaymentAndSetOrderStatus(ctx context.Context, orderID uuid.UUID, succeeded bool) (*PaymentResult, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	row := tx.QueryRow(ctx, `
		SELECT status, total::float8, currency
		FROM orders
		WHERE id = $1 AND deleted_at IS NULL
	`, orderID)
	var status string
	var total float64
	var currency string
	if err := row.Scan(&status, &total, &currency); err != nil {
		return nil, err
	}
	if status != "payment_required" {
		return nil, ErrNotPaymentRequired
	}

	finalPaymentStatus := "failed"
	finalOrderStatus := "cancelled"
	if succeeded {
		finalPaymentStatus = "succeeded"
		finalOrderStatus = "paid"
	}

	providerPaymentID := "fake:" + orderID.String()
	var paymentID uuid.UUID
	row = tx.QueryRow(ctx, `
		INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, metadata)
		VALUES ($1, 'other', $2, $3, $4, $5, '{}'::jsonb)
		ON CONFLICT (provider_payment_id)
		DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
		RETURNING id
	`, orderID, providerPaymentID, total, currency, finalPaymentStatus)
	if err := row.Scan(&paymentID); err != nil {
		return nil, err
	}

	tag, err := tx.Exec(ctx, `
		UPDATE orders
		SET status = $2, updated_at = NOW()
		WHERE id = $1 AND status = 'payment_required' AND deleted_at IS NULL
	`, orderID, finalOrderStatus)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() != 1 {
		return nil, ErrNotPaymentRequired
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &PaymentResult{PaymentID: paymentID, Status: finalPaymentStatus}, nil
}
