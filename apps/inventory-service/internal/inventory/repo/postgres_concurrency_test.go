package repo

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestReserve_HighConcurrencyDoesNotOversell(t *testing.T) {
	t.Parallel()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://admin:secret@localhost:5432/online_storage?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("skipping integration test: cannot create pool (%v)", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping integration test: cannot reach postgres (%v)", err)
	}

	for _, tbl := range []string{"products", "inventory", "inventory_adjustments"} {
		var exists bool
		if err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name = $1
			)
		`, tbl).Scan(&exists); err != nil {
			t.Skipf("skipping integration test: schema check failed (%v)", err)
		}
		if !exists {
			t.Skipf("skipping integration test: table %s is missing, run migrations first", tbl)
		}
	}

	repo := NewPostgres(pool)

	productID := uuid.New()
	skuPrefix := "TEST-IPHONE-CONCURRENCY-"
	sku := skuPrefix + uuid.NewString()
	initialStock := 25
	requests := 80

	_, _ = pool.Exec(ctx, `
		DELETE FROM inventory_adjustments
		WHERE product_id IN (
			SELECT id FROM products WHERE sku LIKE $1
		)
	`, skuPrefix+"%")
	_, _ = pool.Exec(ctx, `
		DELETE FROM inventory
		WHERE product_id IN (
			SELECT id FROM products WHERE sku LIKE $1
		)
	`, skuPrefix+"%")
	_, _ = pool.Exec(ctx, `DELETE FROM products WHERE sku LIKE $1`, skuPrefix+"%")

	_, err = pool.Exec(ctx, `
		INSERT INTO products (id, name, description, sku, price, category, is_active, is_digital)
		VALUES ($1, 'iPhone Concurrency Test', 'stress test product', $2, 1199.00, 'smartphones', true, false)
	`, productID, sku)
	if err != nil {
		t.Fatalf("insert product: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM inventory_adjustments WHERE product_id = $1`, productID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM inventory WHERE product_id = $1`, productID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM products WHERE id = $1`, productID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM products WHERE sku LIKE $1`, skuPrefix+"%")
	})

	_, err = pool.Exec(ctx, `
		INSERT INTO inventory (product_id, available, reserved, on_hand, low_stock_threshold)
		VALUES ($1, $2, 0, $2, 1)
	`, productID, initialStock)
	if err != nil {
		t.Fatalf("insert inventory: %v", err)
	}

	var succeeded int32
	var outOfStock int32
	var unexpectedErrs int32

	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < requests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start

			err := repo.Reserve(ctx, uuid.New(), []OrderItem{
				{ProductID: productID, Quantity: 1},
			})
			if err == nil {
				atomic.AddInt32(&succeeded, 1)
				return
			}
			if errors.Is(err, ErrOutOfStock) {
				atomic.AddInt32(&outOfStock, 1)
				return
			}
			atomic.AddInt32(&unexpectedErrs, 1)
		}()
	}
	close(start)
	wg.Wait()

	if got := int(atomic.LoadInt32(&unexpectedErrs)); got != 0 {
		t.Fatalf("unexpected errors during concurrent reserve: %d", got)
	}
	if got := int(atomic.LoadInt32(&succeeded)); got != initialStock {
		t.Fatalf("successful reservations = %d, want %d", got, initialStock)
	}
	if got := int(atomic.LoadInt32(&outOfStock)); got != requests-initialStock {
		t.Fatalf("out-of-stock responses = %d, want %d", got, requests-initialStock)
	}

	var available int
	var reserved int
	var onHand int
	if err := pool.QueryRow(ctx, `
		SELECT available, reserved, on_hand
		FROM inventory
		WHERE product_id = $1
	`, productID).Scan(&available, &reserved, &onHand); err != nil {
		t.Fatalf("query final inventory: %v", err)
	}

	if available != 0 {
		t.Fatalf("available = %d, want 0", available)
	}
	if reserved != initialStock {
		t.Fatalf("reserved = %d, want %d", reserved, initialStock)
	}
	if onHand != initialStock {
		t.Fatalf("on_hand = %d, want %d", onHand, initialStock)
	}

	var adjustments int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM inventory_adjustments
		WHERE product_id = $1
	`, productID).Scan(&adjustments); err != nil {
		t.Fatalf("count adjustments: %v", err)
	}
	if adjustments != initialStock {
		t.Fatalf("adjustments = %d, want %d", adjustments, initialStock)
	}

	t.Logf("concurrency test passed: %s", fmt.Sprintf("%d/%d reservations succeeded", initialStock, requests))
}
