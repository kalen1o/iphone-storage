# Infrastructure Setup

This guide sets up the foundational infrastructure for your online storage system including Docker Compose configuration, environment management, and shared utilities.

## Step 1: Root Docker Compose Configuration

Create the main Docker Compose file that orchestrates all services.

### Create `docker-compose.yml` at repository root:

```yaml
version: '3.9'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: online-storage-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: ${POSTGRES_DB:-online_storage}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./shared/db/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-admin}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Redis Cache (Optional)
  redis:
    image: redis:7-alpine
    container_name: online-storage-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  # Kafka (via docker-compose subfile)
  kafka:
    extends:
      file: infrastructure/kafka/docker-compose.yml
      service: kafka

  # Core API Service
  core-api:
    build:
      context: ./services/core-api
      dockerfile: Dockerfile
    container_name: online-storage-core-api
    environment:
      # Database
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${POSTGRES_USER:-admin}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      DB_NAME: ${POSTGRES_DB:-online_storage}
      DB_SSL_MODE: disable

      # Kafka
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: core-api

      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379

      # Service
      SERVICE_PORT: 8080
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ENVIRONMENT: ${ENVIRONMENT:-development}
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
      redis:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped

  # Order Service
  order-service:
    build:
      context: ./services/order-service
      dockerfile: Dockerfile
    container_name: online-storage-order-service
    environment:
      # Database
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${POSTGRES_USER:-admin}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      DB_NAME: ${POSTGRES_DB:-online_storage}
      DB_SSL_MODE: disable

      # Kafka
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: order-service
      KAFKA_GROUP_ID: order-service-group

      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379

      # Service
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ENVIRONMENT: ${ENVIRONMENT:-development}
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    networks:
      - backend
    restart: unless-stopped

  # Payment Service
  payment-service:
    build:
      context: ./services/payment-service
      dockerfile: Dockerfile
    container_name: online-storage-payment-service
    environment:
      # Database
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${POSTGRES_USER:-admin}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      DB_NAME: ${POSTGRES_DB:-online_storage}
      DB_SSL_MODE: disable

      # Kafka
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: payment-service
      KAFKA_GROUP_ID: payment-service-group

      # Payment Provider
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-sk_test_dummy}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-whsec_dummy}

      # Service
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ENVIRONMENT: ${ENVIRONMENT:-development}
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    networks:
      - backend
    restart: unless-stopped

  # Inventory Service
  inventory-service:
    build:
      context: ./services/inventory-service
      dockerfile: Dockerfile
    container_name: online-storage-inventory-service
    environment:
      # Database
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${POSTGRES_USER:-admin}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-secret}
      DB_NAME: ${POSTGRES_DB:-online_storage}
      DB_SSL_MODE: disable

      # Kafka
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: inventory-service
      KAFKA_GROUP_ID: inventory-service-group

      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379

      # Service
      LOG_LEVEL: ${LOG_LEVEL:-info}
      ENVIRONMENT: ${ENVIRONMENT:-development}
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
      redis:
        condition: service_healthy
    networks:
      - backend
    restart: unless-stopped

  # NGINX Gateway
  nginx-gateway:
    build:
      context: ./services/nginx-gateway
      dockerfile: Dockerfile
    container_name: online-storage-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./services/nginx-gateway/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infrastructure/nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - core-api
    networks:
      - backend
      - frontend
    restart: unless-stopped

  # Remix Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: online-storage-frontend
    environment:
      REMIX_PUBLIC_API_URL: https://localhost/api
      REMIX_NODE_ENV: ${ENVIRONMENT:-production}
    ports:
      - "3000:3000"
    depends_on:
      - nginx-gateway
    networks:
      - frontend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  kafka_data:
  zookeeper_data:

networks:
  backend:
    driver: bridge
  frontend:
    driver: bridge
```

## Step 2: Kafka Docker Compose Configuration

Create the Kafka-specific Docker Compose configuration.

### Create `infrastructure/kafka/docker-compose.yml`:

```yaml
version: '3.9'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: online-storage-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeper_data:/var/lib/zookeeper/data
      - zookeeper_logs:/var/lib/zookeeper/log
    networks:
      - backend

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    container_name: online-storage-kafka
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
      - "9093:9093"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:9093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: false
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_LOG_SEGMENT_BYTES: 1073741824
      KAFKA_LOG_RETENTION_CHECK_INTERVAL_MS: 300000
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "kafka-topics --bootstrap-server localhost:9092 --list || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Kafka UI (Optional - for development)
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: online-storage-kafka-ui
    depends_on:
      - kafka
    ports:
      - "8081:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
      KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181
    networks:
      - backend

volumes:
  zookeeper_data:
  zookeeper_logs:
  kafka_data:

networks:
  backend:
    driver: bridge
```

### Create `infrastructure/kafka/topics.sh`:

```bash
#!/bin/bash

# Kafka Topics Setup Script
# Usage: ./infrastructure/kafka/topics.sh

set -e

KAFKA_BROKER="${KAFKA_BROKER:-kafka:9092}"

echo "Creating Kafka topics..."

# Order Topics
echo "Creating order topics..."
docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.created \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.updated \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.paid \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.cancelled \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.shipped \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic orders.payment_required \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

# Payment Topics
echo "Creating payment topics..."
docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic payments.initiated \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic payments.succeeded \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic payments.failed \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic payments.webhook_received \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

# Inventory Topics
echo "Creating inventory topics..."
docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic inventory.reserved \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic inventory.released \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic inventory.out_of_stock \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic inventory.adjusted \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000

# Dead Letter Queue
echo "Creating dead letter queue..."
docker exec -it online-storage-kafka kafka-topics --create \
  --if-not-exists \
  --bootstrap-server "$KAFKA_BROKER" \
  --topic events.dlq \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=2592000000

echo "All topics created successfully!"
echo ""
echo "Listing all topics:"
docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server "$KAFKA_BROKER"
```

Make the script executable:

```bash
chmod +x infrastructure/kafka/topics.sh
```

## Step 3: Environment Configuration

Create a `.env.example` file at the repository root:

```bash
# Database Configuration
POSTGRES_USER=admin
POSTGRES_PASSWORD=changeme_secure_password
POSTGRES_DB=online_storage

# Kafka Configuration
KAFKA_BROKERS=kafka:9092

# Service Configuration
LOG_LEVEL=info
ENVIRONMENT=development

# Payment Provider (Stripe)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key

# Frontend Configuration
REMIX_PUBLIC_API_URL=https://localhost/api

# CORS Configuration (for local development)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# JWT Configuration
JWT_SECRET=your_jwt_secret_change_in_production
JWT_EXPIRY=24h

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=60
```

## Step 4: Shared Configuration Module

Create a Go configuration package that all services can use.

### Create `shared/config/config.go`:

```go
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds application configuration
type Config struct {
	// Database
	Database DatabaseConfig

	// Kafka
	Kafka KafkaConfig

	// Redis (optional)
	Redis RedisConfig

	// Service
	Service ServiceConfig

	// JWT
	JWT JWTConfig

	// Rate Limiting
	RateLimit RateLimitConfig
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type KafkaConfig struct {
	Brokers   []string
	ClientID  string
	GroupID   string
	Timeout   time.Duration
	Retries   int
}

type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
	Timeout  time.Duration
}

type ServiceConfig struct {
	Port        int
	LogLevel    string
	Environment string
}

type JWTConfig struct {
	Secret string
	Expiry time.Duration
}

type RateLimitConfig struct {
	RequestsPerMinute int
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvAsInt("DB_PORT", 5432),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "online_storage"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
		},
		Kafka: KafkaConfig{
			Brokers:  getEnvAsSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			ClientID: getEnv("KAFKA_CLIENT_ID", "service"),
			GroupID:  getEnv("KAFKA_GROUP_ID", "service-group"),
			Timeout:  getEnvAsDuration("KAFKA_TIMEOUT", 10*time.Second),
			Retries:  getEnvAsInt("KAFKA_RETRIES", 3),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnvAsInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
			Timeout:  getEnvAsDuration("REDIS_TIMEOUT", 5*time.Second),
		},
		Service: ServiceConfig{
			Port:        getEnvAsInt("SERVICE_PORT", 8080),
			LogLevel:    getEnv("LOG_LEVEL", "info"),
			Environment: getEnv("ENVIRONMENT", "development"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "change-me"),
			Expiry: getEnvAsDuration("JWT_EXPIRY", 24*time.Hour),
		},
		RateLimit: RateLimitConfig{
			RequestsPerMinute: getEnvAsInt("RATE_LIMIT_REQUESTS_PER_MINUTE", 60),
		},
	}

	return cfg, nil
}

// DatabaseDSN returns the PostgreSQL connection string
func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode,
	)
}

// RedisAddr returns the Redis address
func (c *RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// Helper functions
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		// Simple comma-separated parsing
		return []string{value}
	}
	return defaultValue
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
```

## Step 5: Shared Logging Module

Create a structured logging module that all services will use.

### Create `shared/logging/logger.go`:

```go
package logging

import (
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
)

// LogLevel represents the severity level
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
	FATAL
)

// Logger provides structured logging functionality
type Logger struct {
	level    LogLevel
	service  string
	env      string
	fields   map[string]interface{}
}

// New creates a new logger instance
func New(service, env string) *Logger {
	return &Logger{
		level:   parseLogLevel(getEnv("LOG_LEVEL", "info")),
		service: service,
		env:     env,
		fields:  make(map[string]interface{}),
	}
}

// parseLogLevel converts string to LogLevel
func parseLogLevel(level string) LogLevel {
	switch level {
	case "debug":
		return DEBUG
	case "info":
		return INFO
	case "warn", "warning":
		return WARN
	case "error":
		return ERROR
	case "fatal":
		return FATAL
	default:
		return INFO
	}
}

// With adds fields to all subsequent log entries
func (l *Logger) With(fields map[string]interface{}) *Logger {
	newLogger := &Logger{
		level:   l.level,
		service: l.service,
		env:     l.env,
		fields:  make(map[string]interface{}),
	}
	// Copy existing fields
	for k, v := range l.fields {
		newLogger.fields[k] = v
	}
	// Add new fields
	for k, v := range fields {
		newLogger.fields[k] = v
	}
	return newLogger
}

// WithRequest adds request-related fields
func (l *Logger) WithRequest(requestID, userID, orderID string) *Logger {
	return l.With(map[string]interface{}{
		"request_id": requestID,
		"user_id":    userID,
		"order_id":   orderID,
	})
}

// Debug logs a debug message
func (l *Logger) Debug(message string) {
	if l.level <= DEBUG {
		l.log("DEBUG", message)
	}
}

// Info logs an info message
func (l *Logger) Info(message string) {
	if l.level <= INFO {
		l.log("INFO", message)
	}
}

// Warn logs a warning message
func (l *Logger) Warn(message string) {
	if l.level <= WARN {
		l.log("WARN", message)
	}
}

// Error logs an error message
func (l *Logger) Error(message string, err error) {
	if l.level <= ERROR {
		fields := l.fields
		if err != nil {
			if fields == nil {
				fields = make(map[string]interface{})
			}
			fields["error"] = err.Error()
		}
		l.logWithFields("ERROR", message, fields)
	}
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(message string, err error) {
	l.logWithFields("FATAL", message, l.fields)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal error: %v\n", err)
	}
	os.Exit(1)
}

// log formats and outputs a log entry
func (l *Logger) log(level, message string) {
	entry := l.formatEntry(level, message, l.fields)
	fmt.Println(entry)
}

// logWithFields formats and outputs a log entry with additional fields
func (l *Logger) logWithFields(level, message string, fields map[string]interface{}) {
	entry := l.formatEntry(level, message, fields)
	fmt.Println(entry)
}

// formatEntry creates a structured log entry
func (l *Logger) formatEntry(level, message string, fields map[string]interface{}) string {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	requestID := uuid.New().String()

	entry := map[string]interface{}{
		"timestamp":  timestamp,
		"level":      level,
		"service":    l.service,
		"environment": l.env,
		"request_id": requestID,
		"message":    message,
	}

	// Add additional fields
	for k, v := range fields {
		entry[k] = v
	}

	// Format as JSON (simplified)
	return fmt.Sprintf("%s %s [%s] %s", entry["timestamp"], entry["level"], entry["service"], message)
}

// getEnv retrieves an environment variable
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

## Step 6: Create Makefile

Create a Makefile at the repository root for common operations.

### Create `Makefile`:

```makefile
.PHONY: help build up down restart logs clean test

# Default target
help:
	@echo "Available targets:"
	@echo "  make build      - Build all services"
	@echo "  make up         - Start all services"
	@echo "  make down       - Stop all services"
	@echo "  make restart    - Restart all services"
	@echo "  make logs       - View logs from all services"
	@echo "  make clean      - Remove all containers and volumes"
	@echo "  make test       - Run tests"
	@echo "  make db-migrate - Run database migrations"
	@echo "  make kafka-topics - Create Kafka topics"

# Build all services
build:
	docker compose build

# Start all services
up:
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 10
	@echo "Services started successfully!"
	@echo "Core API: http://localhost:8080"
	@echo "Frontend: http://localhost:3000"
	@echo "Kafka UI: http://localhost:8081"

# Stop all services
down:
	docker compose down

# Restart all services
restart: down up

# View logs
logs:
	docker compose logs -f

# View logs for specific service
logs-%:
	docker compose logs -f $*

# Clean everything (CAUTION: removes volumes)
clean:
	docker compose down -v
	docker system prune -f

# Run database migrations
db-migrate:
	docker exec -it online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# Create Kafka topics
kafka-topics:
	./infrastructure/kafka/topics.sh

# Run tests
test:
	go test ./... -v

# Build specific service
build-%:
	docker compose build $*

# Start specific service
up-%:
	docker compose up -d $*

# Stop specific service
down-%:
	docker compose stop $*
```

## Step 7: Verify Setup

Test your infrastructure setup:

```bash
# Build all services
make build

# Start all services
make up

# Check service status
docker compose ps

# Check logs
make logs

# Verify PostgreSQL is accessible
docker exec -it online-storage-postgres psql -U admin -d online_storage -c "SELECT version();"

# Verify Redis is accessible
docker exec -it online-storage-redis redis-cli ping

# Verify Kafka is accessible
docker exec -it online-storage-kafka kafka-topics --list --bootstrap-server localhost:9092

# Create Kafka topics
make kafka-topics
```

## Step 8: Local Development Environment Setup

Create a `.gitignore` file:

```
# Environment variables
.env
.env.local
.env.*.local

# Docker volumes
postgres_data/
redis_data/
kafka_data/
zookeeper_data/

# Build artifacts
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
dist/
build/

# Dependencies
node_modules/
vendor/

# IDE
.idea/
.vscode/
*.swp
*.swo
*~

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Temporary files
tmp/
temp/
*.tmp
```

## Next Steps

With infrastructure set up, continue to the next implementation guide: [02-database-setup.md](./02-database-setup.md)

## Troubleshooting

### Services won't start
- Check port conflicts: `lsof -i :5432`, `lsof -i :6379`, etc.
- Verify Docker daemon is running: `docker info`
- Check logs: `make logs` or `docker compose logs <service>`

### Kafka connection issues
- Wait for Kafka to fully start (may take 30+ seconds)
- Check Zookeeper is running: `docker compose ps zookeeper`
- Verify network connectivity between containers

### PostgreSQL connection issues
- Wait for PostgreSQL health check to pass
- Verify credentials in `.env` match environment variables
- Check PostgreSQL logs: `docker compose logs postgres`
