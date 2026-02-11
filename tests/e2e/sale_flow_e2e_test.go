//go:build e2e

package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type authLoginResponse struct {
	Token string `json:"token"`
}

type productsResponse struct {
	Items []struct {
		ID    string  `json:"id"`
		SKU   string  `json:"sku"`
		Price float64 `json:"price"`
		Name  string  `json:"name"`
	} `json:"items"`
}

type createOrderResponse struct {
	ID     string  `json:"id"`
	Status string  `json:"status"`
	Total  float64 `json:"total"`
}

type getOrderResponse struct {
	ID     string  `json:"id"`
	Status string  `json:"status"`
	Total  float64 `json:"total"`
}

type saleReport struct {
	RunAtUTC                 string             `json:"run_at_utc"`
	CoreAPIBaseURL           string             `json:"core_api_base_url"`
	IPhoneSeededProductCount int                `json:"iphone_seeded_product_count"`
	ActiveUserCount          int                `json:"active_user_count"`
	SimultaneousBaseTarget   int                `json:"simultaneous_base_target"`
	SimultaneousBuyTarget    int                `json:"simultaneous_buy_target"`
	SimultaneousRounds       int                `json:"simultaneous_rounds"`
	AttemptCount             int                `json:"attempt_count"`
	Orders                   []saleOrderAttempt `json:"orders"`
	SimultaneousOrders       []saleOrderAttempt `json:"simultaneous_orders"`
	OrderID                  string             `json:"order_id"`
	OrderStatus              string             `json:"order_status"`
	PaymentStatus            string             `json:"payment_status"`
	PaymentAmount            float64            `json:"payment_amount"`
	ProductSKU               string             `json:"product_sku"`
	ProductID                string             `json:"product_id"`
	ProductName              string             `json:"product_name"`
	Quantity                 int                `json:"quantity"`
	InventoryBefore          int                `json:"inventory_before"`
	InventoryAfter           int                `json:"inventory_after"`
	SaleRecorded             bool               `json:"sale_recorded"`
	VerificationNotes        string             `json:"verification_notes"`
}

type saleOrderAttempt struct {
	Attempt       int     `json:"attempt"`
	OrderID       string  `json:"order_id"`
	OrderStatus   string  `json:"order_status"`
	PaymentStatus string  `json:"payment_status"`
	PaymentAmount float64 `json:"payment_amount"`
}

func TestE2E_OrderToPaymentFlow_GeneratesSaleReport(t *testing.T) {
	coreAPI := envOrDefault("E2E_CORE_API_URL", "http://localhost:8080")
	dbURL := envOrDefault("E2E_DATABASE_URL", "postgres://admin:secret@localhost:5432/online_storage?sslmode=disable")
	customerEmail := envOrDefault("E2E_USER_EMAIL", "customer@example.com")
	customerPassword := envOrDefault("E2E_USER_PASSWORD", "customer12345")
	targetSKU := envOrDefault("E2E_PRODUCT_SKU", "IPHONE-17-PRO-MAX-256GB")
	reportPath := envOrDefault("E2E_REPORT_PATH", "reports/sale-flow-report.json")
	maxAttempts := envIntOrDefault("E2E_MAX_ORDER_ATTEMPTS", 5)
	maxSellOutRounds := envIntOrDefault("E2E_MAX_SELL_OUT_ROUNDS", 20)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping db: %v", err)
	}
	iPhoneSeededProducts, err := countSeededIPhoneProducts(ctx, pool)
	if err != nil {
		t.Fatalf("count seeded iPhone products: %v", err)
	}
	if iPhoneSeededProducts <= 0 {
		randomSeedCount := rand.IntN(100) + 1
		if err := seedIPhoneProducts(ctx, pool, targetSKU, randomSeedCount); err != nil {
			t.Fatalf("seed iPhone products: %v", err)
		}
		iPhoneSeededProducts, err = countSeededIPhoneProducts(ctx, pool)
		if err != nil {
			t.Fatalf("count seeded iPhone products after seed: %v", err)
		}
		if iPhoneSeededProducts <= 0 {
			t.Fatal("failed to seed iPhone products in DB")
		}
	}
	activeUserCount, err := countActiveUsers(ctx, pool)
	if err != nil {
		t.Fatalf("count active users: %v", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	token := loginAndGetToken(t, client, coreAPI, customerEmail, customerPassword)
	productID, productName, productPrice := findProductBySKU(t, client, coreAPI, targetSKU)

	inventoryBefore := getAvailableInventory(t, ctx, pool, productID)
	if inventoryBefore <= 0 {
		if err := restockProductInventory(ctx, pool, productID, 100); err != nil {
			t.Fatalf("restock product %s: %v", targetSKU, err)
		}
		inventoryBefore = getAvailableInventory(t, ctx, pool, productID)
		if inventoryBefore <= 0 {
			t.Fatalf("product %s is out of stock before test", targetSKU)
		}
	}

	var order getOrderResponse
	var paymentStatus string
	var paymentAmount float64
	orderAttempts := make([]saleOrderAttempt, 0, maxAttempts)
	attempts := 0
	for ; attempts < maxAttempts; attempts++ {
		orderID := createOrder(t, client, coreAPI, token, productID)
		order, paymentStatus, paymentAmount = waitForFinalizedOrder(t, client, ctx, coreAPI, token, pool, orderID)
		orderAttempts = append(orderAttempts, saleOrderAttempt{
			Attempt:       attempts + 1,
			OrderID:       order.ID,
			OrderStatus:   order.Status,
			PaymentStatus: paymentStatus,
			PaymentAmount: paymentAmount,
		})
		if order.Status == "paid" {
			break
		}
	}

	inventoryAfter := getAvailableInventory(t, ctx, pool, productID)
	concurrentInventoryBefore := inventoryAfter
	baseTarget := calculateSimultaneousBaseTarget(iPhoneSeededProducts, activeUserCount)
	firstRoundTarget := calculateSimultaneousBuyTarget(baseTarget, concurrentInventoryBefore)
	t.Logf(
		"seeded iPhone products=%d, active users=%d, base target=%d, available=%d, first round target=%d",
		iPhoneSeededProducts,
		activeUserCount,
		baseTarget,
		concurrentInventoryBefore,
		firstRoundTarget,
	)
	if firstRoundTarget <= concurrentInventoryBefore {
		t.Fatalf("simultaneous buy target (%d) must be greater than available (%d)", firstRoundTarget, concurrentInventoryBefore)
	}

	simultaneousOrders := make([]saleOrderAttempt, 0)
	currentAvailable := concurrentInventoryBefore
	sellOutRounds := 0
	for round := 1; round <= maxSellOutRounds && currentAvailable > 0; round++ {
		roundTarget := calculateSimultaneousBuyTarget(baseTarget, currentAvailable)
		roundOrders, err := runSimultaneousBuys(
			ctx,
			client,
			coreAPI,
			token,
			pool,
			productID,
			roundTarget,
			len(simultaneousOrders),
		)
		if err != nil {
			t.Fatalf("run simultaneous buys round %d: %v", round, err)
		}
		simultaneousOrders = append(simultaneousOrders, roundOrders...)

		nextAvailable := getAvailableInventory(t, ctx, pool, productID)
		roundPaidCount := countOrdersByStatus(roundOrders, "paid")
		if nextAvailable != currentAvailable-roundPaidCount {
			t.Fatalf(
				"round %d inventory mismatch: before=%d after=%d paid=%d",
				round,
				currentAvailable,
				nextAvailable,
				roundPaidCount,
			)
		}
		currentAvailable = nextAvailable
		sellOutRounds = round
	}
	if currentAvailable != 0 {
		t.Fatalf("failed to sell out product inventory; remaining available=%d after %d rounds", currentAvailable, sellOutRounds)
	}
	concurrentInventoryAfter := currentAvailable
	paidCount := countOrdersByStatus(simultaneousOrders, "paid")

	report := saleReport{
		RunAtUTC:                 time.Now().UTC().Format(time.RFC3339),
		CoreAPIBaseURL:           coreAPI,
		IPhoneSeededProductCount: iPhoneSeededProducts,
		ActiveUserCount:          activeUserCount,
		SimultaneousBaseTarget:   baseTarget,
		SimultaneousBuyTarget:    firstRoundTarget,
		SimultaneousRounds:       sellOutRounds,
		AttemptCount:             attempts + 1,
		Orders:                   orderAttempts,
		SimultaneousOrders:       simultaneousOrders,
		OrderID:                  order.ID,
		OrderStatus:              order.Status,
		PaymentStatus:            paymentStatus,
		PaymentAmount:            paymentAmount,
		ProductSKU:               targetSKU,
		ProductID:                productID,
		ProductName:              productName,
		Quantity:                 1,
		InventoryBefore:          inventoryBefore,
		InventoryAfter:           concurrentInventoryAfter,
		SaleRecorded:             order.Status == "paid" && paymentStatus == "succeeded",
	}

	switch order.Status {
	case "paid":
		if inventoryAfter != inventoryBefore-1 {
			t.Fatalf("paid order must decrement available stock by 1: before=%d after=%d", inventoryBefore, inventoryAfter)
		}
		report.VerificationNotes = fmt.Sprintf(
			"Payment succeeded after %d attempt(s). Simultaneous buys executed=%d with paid=%d across %d rounds. Inventory sold out to zero.",
			attempts+1,
			len(simultaneousOrders),
			paidCount,
			sellOutRounds,
		)
	case "cancelled":
		if attempts >= maxAttempts {
			report.VerificationNotes = fmt.Sprintf("No successful payment after %d attempt(s).", maxAttempts)
			writeSaleReport(t, reportPath, report)
			t.Fatalf("failed to produce a successful sale after %d attempts", maxAttempts)
		}
		t.Fatalf("unexpected cancelled order before max attempts")
	default:
		t.Fatalf("unexpected final order status: %s", order.Status)
	}

	if order.Total <= 0 || productPrice <= 0 {
		t.Fatalf("invalid monetary values: order.total=%.2f product.price=%.2f", order.Total, productPrice)
	}

	writeSaleReport(t, reportPath, report)
}

func loginAndGetToken(t *testing.T, client *http.Client, coreAPI, email, password string) string {
	t.Helper()

	respBody, status := doJSONRequest(t, client, http.MethodPost, coreAPI+"/api/auth/login", "", map[string]string{
		"email":    email,
		"password": password,
	})
	if status != http.StatusOK {
		t.Fatalf("login failed with status %d: %s", status, string(respBody))
	}

	var out authLoginResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if out.Token == "" {
		t.Fatal("login returned empty token")
	}
	return out.Token
}

func findProductBySKU(t *testing.T, client *http.Client, coreAPI, sku string) (string, string, float64) {
	t.Helper()

	respBody, status := doJSONRequest(t, client, http.MethodGet, coreAPI+"/api/products?limit=200", "", nil)
	if status != http.StatusOK {
		t.Fatalf("get products failed with status %d: %s", status, string(respBody))
	}

	var out productsResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		t.Fatalf("decode products response: %v", err)
	}
	for _, p := range out.Items {
		if p.SKU == sku {
			return p.ID, p.Name, p.Price
		}
	}
	t.Fatalf("target product with SKU %s not found", sku)
	return "", "", 0
}

func createOrder(t *testing.T, client *http.Client, coreAPI, token, productID string) string {
	t.Helper()

	productUUID, err := uuid.Parse(productID)
	if err != nil {
		t.Fatalf("invalid product id: %v", err)
	}

	payload := map[string]any{
		"shipping_address_text": "123 Test Street, San Francisco, CA 94102, USA",
		"customer_notes":        "e2e flow test",
		"items": []map[string]any{
			{
				"product_id": productUUID.String(),
				"quantity":   1,
			},
		},
	}

	respBody, status := doJSONRequest(t, client, http.MethodPost, coreAPI+"/api/orders", token, payload)
	if status != http.StatusCreated {
		t.Fatalf("create order failed with status %d: %s", status, string(respBody))
	}

	var out createOrderResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		t.Fatalf("decode create order response: %v", err)
	}
	if out.ID == "" {
		t.Fatal("create order returned empty order id")
	}
	return out.ID
}

func waitForFinalizedOrder(
	t *testing.T,
	client *http.Client,
	ctx context.Context,
	coreAPI, token string,
	pool *pgxpool.Pool,
	orderID string,
) (getOrderResponse, string, float64) {
	t.Helper()

	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		respBody, status := doJSONRequest(t, client, http.MethodGet, coreAPI+"/api/orders/"+orderID, token, nil)
		if status == http.StatusOK {
			var out getOrderResponse
			if err := json.Unmarshal(respBody, &out); err != nil {
				t.Fatalf("decode get order response: %v", err)
			}
			if out.Status == "paid" || out.Status == "cancelled" {
				var paymentStatus string
				var paymentAmount float64
				err := pool.QueryRow(ctx, `
					SELECT status, amount::float8
					FROM payments
					WHERE order_id = $1
					ORDER BY created_at DESC
					LIMIT 1
				`, orderID).Scan(&paymentStatus, &paymentAmount)
				if err != nil {
					if errors.Is(err, pgx.ErrNoRows) {
						return out, "not_created", 0
					}
					t.Fatalf("query payment for order %s: %v", orderID, err)
				}
				return out, paymentStatus, paymentAmount
			}
		}
		time.Sleep(1 * time.Second)
	}

	t.Fatalf("order %s did not reach terminal state within timeout", orderID)
	return getOrderResponse{}, "", 0
}

func getAvailableInventory(t *testing.T, ctx context.Context, pool *pgxpool.Pool, productID string) int {
	t.Helper()

	var available int
	if err := pool.QueryRow(ctx, `
		SELECT available
		FROM inventory
		WHERE product_id = $1
	`, productID).Scan(&available); err != nil {
		t.Fatalf("query inventory for product %s: %v", productID, err)
	}
	return available
}

func countSeededIPhoneProducts(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	var count int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM products
		WHERE sku LIKE 'IPHONE-%' AND deleted_at IS NULL
	`).Scan(&count)
	return count, err
}

func seedIPhoneProducts(ctx context.Context, pool *pgxpool.Pool, primarySKU string, total int) error {
	if total <= 0 {
		return nil
	}

	for i := 0; i < total; i++ {
		productID := uuid.New()
		name := fmt.Sprintf("iPhone 17 Pro Max Seed %d", i+1)
		sku := fmt.Sprintf("IPHONE-17-PRO-MAX-SEED-%02d", i+1)
		if i == 0 && primarySKU != "" {
			sku = primarySKU
			name = "iPhone 17 Pro Max"
		}

		_, err := pool.Exec(ctx, `
			INSERT INTO products (id, name, description, sku, price, category, is_active, is_digital)
			VALUES ($1, $2, 'seeded by e2e test', $3, 1199.00, 'smartphones', true, false)
		`, productID, name, sku)
		if err != nil {
			return err
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO inventory (product_id, available, reserved, on_hand, low_stock_threshold)
			VALUES ($1, 100, 0, 100, 10)
		`, productID)
		if err != nil {
			return err
		}
	}

	return nil
}

func countActiveUsers(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	var count int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM users
		WHERE is_active = true AND deleted_at IS NULL
	`).Scan(&count)
	return count, err
}

func restockProductInventory(ctx context.Context, pool *pgxpool.Pool, productID string, targetStock int) error {
	if targetStock <= 0 {
		targetStock = 100
	}
	_, err := pool.Exec(ctx, `
		UPDATE inventory
		SET available = $2,
		    reserved = 0,
		    on_hand = GREATEST(on_hand, $2),
		    updated_at = NOW()
		WHERE product_id = $1
	`, productID, targetStock)
	return err
}

func calculateSimultaneousBaseTarget(totalProducts, userCount int) int {
	usersThirtyPercent := int(math.Ceil(float64(userCount) * 0.30))
	if usersThirtyPercent < 1 {
		usersThirtyPercent = 1
	}
	productsThirtyPercent := int(math.Ceil(float64(totalProducts) * 0.30))
	if productsThirtyPercent < 1 {
		productsThirtyPercent = 1
	}
	target := userCount * productsThirtyPercent
	if target < 1 {
		return 1
	}
	return target
}

func calculateSimultaneousBuyTarget(baseTarget, available int) int {
	target := baseTarget
	if target < 1 {
		target = 1
	}
	// Force demand above current stock to verify oversell protection.
	if target <= available {
		target = available + 1
	}
	return target
}

func runSimultaneousBuys(
	ctx context.Context,
	client *http.Client,
	coreAPI, token string,
	pool *pgxpool.Pool,
	productID string,
	total int,
	attemptOffset int,
) ([]saleOrderAttempt, error) {
	if total <= 0 {
		return []saleOrderAttempt{}, nil
	}

	results := make([]saleOrderAttempt, total)
	errCh := make(chan error, total)
	start := make(chan struct{})

	var wg sync.WaitGroup
	for i := 0; i < total; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start

			orderID, err := createOrderNoFail(client, coreAPI, token, productID)
			if err != nil {
				errCh <- fmt.Errorf("attempt %d create order: %w", i+1, err)
				return
			}
			order, paymentStatus, paymentAmount, err := waitForFinalizedOrderNoFail(ctx, client, coreAPI, token, pool, orderID)
			if err != nil {
				errCh <- fmt.Errorf("attempt %d finalize order %s: %w", i+1, orderID, err)
				return
			}
			results[i] = saleOrderAttempt{
				Attempt:       attemptOffset + i + 1,
				OrderID:       order.ID,
				OrderStatus:   order.Status,
				PaymentStatus: paymentStatus,
				PaymentAmount: paymentAmount,
			}
		}()
	}
	close(start)
	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return nil, err
		}
	}
	return results, nil
}

func createOrderNoFail(client *http.Client, coreAPI, token, productID string) (string, error) {
	payload := map[string]any{
		"shipping_address_text": "123 Test Street, San Francisco, CA 94102, USA",
		"customer_notes":        "e2e simultaneous flow test",
		"items": []map[string]any{
			{
				"product_id": productID,
				"quantity":   1,
			},
		},
	}

	respBody, status, err := doJSONRequestNoFail(client, http.MethodPost, coreAPI+"/api/orders", token, payload)
	if err != nil {
		return "", err
	}
	if status != http.StatusCreated {
		return "", fmt.Errorf("status=%d body=%s", status, string(respBody))
	}

	var out createOrderResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return "", err
	}
	if out.ID == "" {
		return "", fmt.Errorf("empty order id")
	}
	return out.ID, nil
}

func waitForFinalizedOrderNoFail(
	ctx context.Context,
	client *http.Client,
	coreAPI, token string,
	pool *pgxpool.Pool,
	orderID string,
) (getOrderResponse, string, float64, error) {
	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		respBody, status, err := doJSONRequestNoFail(client, http.MethodGet, coreAPI+"/api/orders/"+orderID, token, nil)
		if err != nil {
			return getOrderResponse{}, "", 0, err
		}
		if status == http.StatusOK {
			var out getOrderResponse
			if err := json.Unmarshal(respBody, &out); err != nil {
				return getOrderResponse{}, "", 0, err
			}
			if out.Status == "paid" || out.Status == "cancelled" {
				var paymentStatus string
				var paymentAmount float64
				err := pool.QueryRow(ctx, `
					SELECT status, amount::float8
					FROM payments
					WHERE order_id = $1
					ORDER BY created_at DESC
					LIMIT 1
				`, orderID).Scan(&paymentStatus, &paymentAmount)
				if err != nil {
					if errors.Is(err, pgx.ErrNoRows) {
						return out, "not_created", 0, nil
					}
					return getOrderResponse{}, "", 0, err
				}
				return out, paymentStatus, paymentAmount, nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return getOrderResponse{}, "", 0, fmt.Errorf("order %s did not reach terminal state within timeout", orderID)
}

func countOrdersByStatus(orders []saleOrderAttempt, status string) int {
	count := 0
	for _, o := range orders {
		if o.OrderStatus == status {
			count++
		}
	}
	return count
}

func doJSONRequest(
	t *testing.T,
	client *http.Client,
	method, url, token string,
	payload any,
) ([]byte, int) {
	t.Helper()

	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatalf("encode request payload: %v", err)
		}
	}

	req, err := http.NewRequest(method, url, &body)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, url, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return respBody, resp.StatusCode
}

func doJSONRequestNoFail(
	client *http.Client,
	method, url, token string,
	payload any,
) ([]byte, int, error) {
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			return nil, 0, err
		}
	}

	req, err := http.NewRequest(method, url, &body)
	if err != nil {
		return nil, 0, err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return respBody, resp.StatusCode, nil
}

func writeSaleReport(t *testing.T, reportPath string, report saleReport) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(reportPath), 0o755); err != nil {
		t.Fatalf("create report directory: %v", err)
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatalf("marshal report: %v", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(reportPath, data, 0o644); err != nil {
		t.Fatalf("write report: %v", err)
	}

	t.Logf("sale report written: %s", reportPath)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOrDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
