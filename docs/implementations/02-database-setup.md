# Database Setup

This guide sets up the PostgreSQL database with schemas, tables, migrations, and seeding data for the online storage system.

## Step 1: Create Database Schema

### Create `shared/db/migrations/001_initial_schema.sql`:

```sql
-- Initial Database Schema for Online Storage
-- This schema supports: users, products, orders, payments, and inventory

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'customer' NOT NULL CHECK (role IN ('customer', 'admin')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- PRODUCTS DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    compare_at_price DECIMAL(10, 2) CHECK (compare_at_price >= 0),
    category VARCHAR(100),
    images JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_digital BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- INVENTORY DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    available INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    low_stock_threshold INTEGER DEFAULT 10 CHECK (low_stock_threshold >= 0),
    location VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_id)
);

CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory(product_id) WHERE available < low_stock_threshold;

-- Inventory adjustments history
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN ('initial', 'purchase', 'sale', 'return', 'correction', 'adjustment')),
    quantity INTEGER NOT NULL,
    available_before INTEGER NOT NULL,
    available_after INTEGER NOT NULL,
    reason TEXT,
    reference_id UUID, -- Order ID or other reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inventory_adjustments_product_id ON inventory_adjustments(product_id);
CREATE INDEX idx_inventory_adjustments_reference_id ON inventory_adjustments(reference_id);
CREATE INDEX idx_inventory_adjustments_created_at ON inventory_adjustments(created_at DESC);

-- ============================================================================
-- ORDERS DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'payment_required', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
    )),
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
    total DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    customer_notes TEXT,
    internal_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_deleted_at ON orders(deleted_at) WHERE deleted_at IS NULL;

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- ============================================================================
-- PAYMENTS DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('stripe', 'paypal', 'other')),
    provider_payment_id VARCHAR(255) UNIQUE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded'
    )),
    payment_method_id VARCHAR(255),
    payment_method_type VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Payment events for tracking webhook events
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    provider_event_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_events_payment_id ON payment_events(payment_id);
CREATE INDEX idx_payment_events_provider_event_id ON payment_events(provider_event_id);
CREATE INDEX idx_payment_events_processed ON payment_events(processed);

-- ============================================================================
-- ADDRESSES (Shipping/Billing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('shipping', 'billing')),
    full_name VARCHAR(255),
    company VARCHAR(255),
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    is_default BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id);
CREATE INDEX idx_addresses_order_id ON addresses(order_id);

-- ============================================================================
-- SESSIONS (for Redis fallback, but stored in DB)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- FUNCTION: Update timestamp automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Step 2: Create Seed Data

### Create `shared/db/seeds/001_sample_data.sql`:

```sql
-- Sample Seed Data for Development and Testing

-- ============================================================================
-- USERS
-- ============================================================================

-- Create test admin user
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
(
    uuid_generate_v4(),
    'admin@example.com',
    '$2a$10$ExampleHashedPasswordForAdmin123', -- Replace with actual bcrypt hash
    'Admin',
    'User',
    'admin',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Create test customer users
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
(
    uuid_generate_v4(),
    'customer@example.com',
    '$2a$10$ExampleHashedPasswordForCustomer', -- Replace with actual bcrypt hash
    'John',
    'Doe',
    'customer',
    true,
    true
),
(
    uuid_generate_v4(),
    'jane@example.com',
    '$2a$10$ExampleHashedPasswordForJane', -- Replace with actual bcrypt hash
    'Jane',
    'Smith',
    'customer',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- PRODUCTS
-- ============================================================================

-- Create sample products
WITH product_data AS (
    SELECT
        unnest(array[
            'Basic Storage Plan',
            'Premium Storage Plan',
            'Enterprise Storage Plan',
            'Cloud Backup',
            'File Sync',
            'Team Collaboration'
        ]) as name,
        unnest(array[
            '50 GB of secure cloud storage',
            '500 GB of secure cloud storage with priority support',
            '2 TB of secure cloud storage with enterprise features',
            'Automatic backup for all your files',
            'Sync files across all your devices',
            'Collaborate with your team in real-time'
        ]) as description,
        unnest(array[
            'STORAGE-BASIC',
            'STORAGE-PREMIUM',
            'STORAGE-ENTERPRISE',
            'BACKUP-001',
            'SYNC-001',
            'TEAM-001'
        ]) as sku,
        unnest(array[4.99, 9.99, 29.99, 2.99, 1.99, 4.99]) as price,
        unnest(array[NULL, 7.99, 24.99, NULL, NULL, NULL]) as compare_at_price,
        unnest(array['storage', 'storage', 'storage', 'backup', 'sync', 'collaboration']) as category,
        unnest(array[true, true, true, false, false, false]) as is_digital
)
INSERT INTO products (name, description, sku, price, compare_at_price, category, is_digital, is_active)
SELECT name, description, sku, price, compare_at_price, category, is_digital, true
FROM product_data
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- INVENTORY
-- ============================================================================

-- Initialize inventory for products
-- For digital products, inventory is unlimited (set high number)
INSERT INTO inventory (product_id, available, reserved, on_hand, low_stock_threshold)
SELECT
    p.id,
    CASE WHEN p.is_digital THEN 10000 ELSE 100 END,
    0,
    CASE WHEN p.is_digital THEN 10000 ELSE 100 END,
    CASE WHEN p.is_digital THEN 1000 ELSE 10 END
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_id = p.id
);

-- ============================================================================
-- ADDRESSES
-- ============================================================================

-- Add sample addresses for test users
INSERT INTO addresses (user_id, address_type, full_name, line1, line2, city, state, postal_code, country, phone, is_default)
SELECT
    u.id,
    'shipping',
    u.first_name || ' ' || u.last_name,
    '123 Main Street',
    'Apt 4B',
    'San Francisco',
    'CA',
    '94102',
    'USA',
    '+1-555-0100',
    true
FROM users u
WHERE u.email IN ('customer@example.com', 'jane@example.com')
AND NOT EXISTS (
    SELECT 1 FROM addresses a WHERE a.user_id = u.id
);

-- ============================================================================
-- INITIAL DATA SUMMARY
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Seed data created successfully';
    RAISE NOTICE 'Users: %', (SELECT COUNT(*) FROM users);
    RAISE NOTICE 'Products: %', (SELECT COUNT(*) FROM products);
    RAISE NOTICE 'Inventory records: %', (SELECT COUNT(*) FROM inventory);
    RAISE NOTICE 'Addresses: %', (SELECT COUNT(*) FROM addresses);
END $$;
```

## Step 3: Go Database Module

Create a reusable Go database package.

### Create `shared/db/db.go`:

```go
package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the PostgreSQL connection pool
type DB struct {
	pool *pgxpool.Pool
}

// New creates a new database connection pool
func New(ctx context.Context, dsn string) (*DB, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Configure pool
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{pool: pool}, nil
}

// Pool returns the underlying connection pool
func (db *DB) Pool() *pgxpool.Pool {
	return db.pool
}

// Close closes the database connection pool
func (db *DB) Close() {
	db.pool.Close()
}

// Exec executes a SQL query without returning any rows
func (db *DB) Exec(ctx context.Context, sql string, args ...interface{}) (pgx.CommandTag, error) {
	return db.pool.Exec(ctx, sql, args...)
}

// Query executes a SQL query that returns rows
func (db *DB) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	return db.pool.Query(ctx, sql, args...)
}

// QueryRow executes a SQL query that returns a single row
func (db *DB) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	return db.pool.QueryRow(ctx, sql, args...)
}

// Begin starts a new transaction
func (db *DB) Begin(ctx context.Context) (pgx.Tx, error) {
	return db.pool.Begin(ctx)
}

// BeginTx starts a new transaction with options
func (db *DB) BeginTx(ctx context.Context, txOptions pgx.TxOptions) (pgx.Tx, error) {
	return db.pool.BeginTx(ctx, txOptions)
}

// InTx executes a function within a transaction
func (db *DB) InTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p) // Re-throw panic after rollback
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("error rolling back transaction: %v (original error: %w)", rbErr, err)
		}
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("error committing transaction: %w", err)
	}

	return nil
}

// SQLDB returns the database/sql compatible interface
func (db *DB) SQLDB() (*sql.DB, error) {
	return sql.OpenDB(stdlib.GetConnector(pool)), nil
}

// HealthCheck performs a health check on the database
func (db *DB) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return db.pool.Ping(ctx)
}

// Stats returns connection pool statistics
func (db *DB) Stats() *pgxpool.Stat {
	return db.pool.Stat()
}
```

### Create `shared/db/migrations/migration.go`:

```go
package migrations

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

//go:embed *.sql
var migrationFiles embed.FS

// Migrate runs all pending migrations
func Migrate(ctx context.Context, tx pgx.Tx) error {
	// Ensure migrations table exists
	if err := createMigrationsTable(ctx, tx); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Get list of migration files
	files, err := migrationFiles.ReadDir(".")
	if err != nil {
		return fmt.Errorf("failed to read migration files: %w", err)
	}

	// Sort files by name to ensure correct order
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	// Run migrations
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		if err := runMigration(ctx, tx, file.Name()); err != nil {
			return fmt.Errorf("failed to run migration %s: %w", file.Name(), err)
		}
	}

	return nil
}

// createMigrationsTable creates the table to track migrations
func createMigrationsTable(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);
	`)
	return err
}

// runMigration runs a single migration
func runMigration(ctx context.Context, tx pgx.Tx, filename string) error {
	// Check if migration already applied
	var applied bool
	err := tx.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)",
		filename,
	).Scan(&applied)

	if err != nil {
		return err
	}

	if applied {
		fmt.Printf("Migration %s already applied, skipping\n", filename)
		return nil
	}

	// Read migration file
	content, err := migrationFiles.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	// Execute migration
	if _, err := tx.Exec(ctx, string(content)); err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	// Record migration
	_, err = tx.Exec(ctx,
		"INSERT INTO schema_migrations (version) VALUES ($1)",
		filename,
	)

	if err != nil {
		return fmt.Errorf("failed to record migration: %w", err)
	}

	fmt.Printf("Applied migration %s\n", filename)
	return nil
}
```

## Step 4: Database Utilities

Create helper functions for common database operations.

### Create `shared/db/query.go`:

```go
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// UUIDFromParamString converts a string parameter to UUID
func UUIDFromParamString(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// NullTime returns a sql.NullTime from a time pointer
func NullTime(t *time.Time) *time.Time {
	return t
}

// TimePtr converts time.Time to pointer
func TimePtr(t time.Time) *time.Time {
	return &t
}

// StringPtr converts string to pointer
func StringPtr(s string) *string {
	return &s
}

// IntPtr converts int to pointer
func IntPtr(i int) *int {
	return &i
}

// Float64Ptr converts float64 to pointer
func Float64Ptr(f float64) *float64 {
	return &f
}

// BuildWhereClause constructs a WHERE clause dynamically
func BuildWhereClause(conditions []string) string {
	if len(conditions) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(conditions, " AND ")
}

// BuildPagination adds LIMIT and OFFSET to a query
func BuildPagination(query string, limit, offset int) string {
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}
	if offset > 0 {
		query += fmt.Sprintf(" OFFSET %d", offset)
	}
	return query
}
```

### Create `shared/db/seed.go`:

```go
package db

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

//go:embed ../seeds/*.sql
var seedFiles embed.FS

// Seed runs all seed files
func Seed(ctx context.Context, tx pgx.Tx) error {
	// Get list of seed files
	files, err := seedFiles.ReadDir("seeds")
	if err != nil {
		return fmt.Errorf("failed to read seed files: %w", err)
	}

	// Sort files by name to ensure correct order
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	// Run seeds
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		if err := runSeed(ctx, tx, file.Name()); err != nil {
			return fmt.Errorf("failed to run seed %s: %w", file.Name(), err)
		}
	}

	return nil
}

// runSeed runs a single seed file
func runSeed(ctx context.Context, tx pgx.Tx, filename string) error {
	// Read seed file
	content, err := seedFiles.ReadFile("seeds/" + filename)
	if err != nil {
		return fmt.Errorf("failed to read seed file: %w", err)
	}

	// Execute seed
	if _, err := tx.Exec(ctx, string(content)); err != nil {
		return fmt.Errorf("failed to execute seed: %w", err)
	}

	fmt.Printf("Applied seed %s\n", filename)
	return nil
}
```

## Step 5: Run Database Setup

Execute these commands to set up your database:

```bash
# Start the infrastructure
make up

# Wait for PostgreSQL to be ready
docker compose logs -f postgres

# Run the initial schema
docker exec -it online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# Run the seed data (optional, for development)
docker exec -it online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_sample_data.sql

# Verify the schema was created
docker exec -it online-storage-postgres psql -U admin -d online_storage -c "\dt"

# Verify the data
docker exec -it online-storage-postgres psql -U admin -d online_storage -c "SELECT COUNT(*) FROM users;"
docker exec -it online-storage-postgres psql -U admin -d online_storage -c "SELECT COUNT(*) FROM products;"
docker exec -it online-storage-postgres psql -U admin -d online_storage -c "SELECT COUNT(*) FROM inventory;"
```

## Step 6: Database Maintenance Scripts

Create helper scripts for common database operations.

### Create `scripts/db-migrate.sh`:

```bash
#!/bin/bash

# Database Migration Script
# Usage: ./scripts/db-migrate.sh [up|down|status]

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-online_storage}"
DB_PASSWORD="${DB_PASSWORD:-secret}"

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME "$@"
```

### Create `scripts/db-backup.sh`:

```bash
#!/bin/bash

# Database Backup Script
# Usage: ./scripts/db-backup.sh [output_file]

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-online_storage}"
DB_PASSWORD="${DB_PASSWORD:-secret}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${1:-backup_${DB_NAME}_${TIMESTAMP}.sql}"

echo "Backing up database: $DB_NAME"
echo "Output file: $OUTPUT_FILE"

PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > "$OUTPUT_FILE"

echo "Backup completed: $OUTPUT_FILE"
```

### Create `scripts/db-restore.sh`:

```bash
#!/bin/bash

# Database Restore Script
# Usage: ./scripts/db-restore.sh <input_file>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <input_file>"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-online_storage}"
DB_PASSWORD="${DB_PASSWORD:-secret}"
INPUT_FILE="$1"

echo "Restoring database: $DB_NAME"
echo "From file: $INPUT_FILE"

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < "$INPUT_FILE"

echo "Restore completed"
```

Make the scripts executable:

```bash
chmod +x scripts/db-migrate.sh
chmod +x scripts/db-backup.sh
chmod +x scripts/db-restore.sh
```

## Step 7: Update Makefile

Add database-related targets to the Makefile:

```makefile
# Database targets
db-connect:
	docker exec -it online-storage-postgres psql -U admin -d online_storage

db-migrate:
	docker exec -it online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_initial_schema.sql

db-seed:
	docker exec -it online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_sample_data.sql

db-reset:
	docker exec -it online-storage-postgres psql -U admin -d postgres -c "DROP DATABASE IF EXISTS online_storage;"
	docker exec -it online-storage-postgres psql -U admin -d postgres -c "CREATE DATABASE online_storage;"
	$(MAKE) db-migrate

db-backup:
	@./scripts/db-backup.sh

db-restore:
	@./scripts/db-restore.sh $(FILE)
```

## Step 8: Verification

Verify your database setup:

```bash
# Connect to the database
make db-connect

# Inside psql, run these commands:

-- List all tables
\dt

-- Check table structure
\d users
\d products
\d inventory
\d orders
\d order_items
\d payments
\d addresses

-- Check constraints
\d+ users

-- Check indexes
\di

-- Check functions
\df

-- View seed data
SELECT * FROM users;
SELECT id, name, sku, price FROM products;
SELECT * FROM inventory;
```

## Next Steps

With the database set up, continue to the next implementation guide: [03-kafka-setup.md](./03-kafka-setup.md)

## Troubleshooting

### Migration fails
- Check PostgreSQL is running: `docker compose ps postgres`
- Review migration logs: `docker compose logs postgres`
- Verify connection string in environment variables

### Seed data conflicts
- Drop and recreate database: `make db-reset`
- Check for duplicate entries before seeding

### Connection refused
- Verify PostgreSQL port: `lsof -i :5432`
- Check Docker network: `docker network ls`
- Review PostgreSQL logs: `docker compose logs postgres`
