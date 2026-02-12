package repo

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (r *Postgres) GetAvailableByProductIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]int, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]int{}, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT product_id, available
		FROM inventory
		WHERE product_id = ANY($1::uuid[])
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[uuid.UUID]int, len(ids))
	for rows.Next() {
		var pid uuid.UUID
		var available int
		if err := rows.Scan(&pid, &available); err != nil {
			return nil, err
		}
		out[pid] = available
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Postgres) GetAvailableByProductID(ctx context.Context, id uuid.UUID) (int, error) {
	var available int
	err := r.pool.QueryRow(ctx, `
		SELECT available
		FROM inventory
		WHERE product_id = $1
	`, id).Scan(&available)
	if err != nil {
		return 0, err
	}
	return available, nil
}
