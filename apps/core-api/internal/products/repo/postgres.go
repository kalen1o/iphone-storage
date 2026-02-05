package repo

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (r *Postgres) List(ctx context.Context, limit, offset int) ([]Product, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, name, COALESCE(description, ''), sku, price::float8, COALESCE(category, ''), images, metadata,
		       is_active, is_digital, created_at, updated_at
		FROM products
		WHERE deleted_at IS NULL AND is_active = true
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Product, 0, limit)
	for rows.Next() {
		var p Product
		var rawImages, rawMetadata json.RawMessage
		if err := rows.Scan(
			&p.ID,
			&p.Name,
			&p.Description,
			&p.SKU,
			&p.Price,
			&p.Category,
			&rawImages,
			&rawMetadata,
			&p.IsActive,
			&p.IsDigital,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(rawImages, &p.Images)
		_ = json.Unmarshal(rawMetadata, &p.Metadata)
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Postgres) GetByID(ctx context.Context, id uuid.UUID) (*Product, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), sku, price::float8, COALESCE(category, ''), images, metadata,
		       is_active, is_digital, created_at, updated_at
		FROM products
		WHERE id = $1 AND deleted_at IS NULL AND is_active = true
	`, id)

	var p Product
	var rawImages, rawMetadata json.RawMessage
	if err := row.Scan(
		&p.ID,
		&p.Name,
		&p.Description,
		&p.SKU,
		&p.Price,
		&p.Category,
		&rawImages,
		&rawMetadata,
		&p.IsActive,
		&p.IsDigital,
		&p.CreatedAt,
		&p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(rawImages, &p.Images)
	_ = json.Unmarshal(rawMetadata, &p.Metadata)
	return &p, nil
}
