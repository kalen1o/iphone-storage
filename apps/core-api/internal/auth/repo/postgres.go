package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (r *Postgres) CreateUser(ctx context.Context, input CreateUserInput) (*User, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified)
		VALUES ($1, $2, $3, $4, $5, true, true)
		RETURNING id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at
	`, input.Email, input.PasswordHash, input.FirstName, input.LastName, input.Role)

	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FirstName, &u.LastName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Postgres) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at
		FROM users
		WHERE email = $1 AND deleted_at IS NULL
	`, email)

	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FirstName, &u.LastName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}
