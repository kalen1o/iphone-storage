.PHONY: help build up down restart logs clean test db-migrate db-seed kafka-topics swagger

help:
	@echo "Available targets:"
	@echo "  make build        - Build all services"
	@echo "  make up           - Start all services"
	@echo "  make down         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo "  make logs         - View logs from all services"
	@echo "  make clean        - Remove all containers and volumes (destructive)"
	@echo "  make test         - Run Go tests"
	@echo "  make db-migrate   - Run database migrations (init SQL)"
	@echo "  make db-seed      - Run seed data SQL"
	@echo "  make kafka-topics - Create Kafka topics"
	@echo "  make swagger      - Generate Swagger docs"

build:
	docker compose build

up:
	docker compose up -d
	@echo "Core API:  http://localhost:8080"
	@echo "Frontend:  http://localhost:3000"
	@echo "Kafka UI:  http://localhost:8081"
	@echo "Swagger (Core API):       http://localhost/swagger/core-api/index.html"
	@echo "Swagger (Order Service):  http://localhost/swagger/order-service/index.html"
	@echo "Swagger (Payment Service): http://localhost/swagger/payment-service/index.html"
	@echo "Swagger (Inventory Service): http://localhost/swagger/inventory-service/index.html"

down:
	docker compose down

restart: down build up

logs:
	docker compose logs -f

logs-%:
	docker compose logs -f $*

clean:
	docker compose down -v
	docker system prune -f

db-migrate:
	docker exec -i online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/001_initial_schema.sql

db-seed:
	docker exec -i online-storage-postgres psql -U admin -d online_storage -f /docker-entrypoint-initdb.d/002_seed_data.sql

kafka-topics:
	./infrastructure/kafka/topics.sh

test:
	GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/go-mod go test ./... -v

swagger:
	go run github.com/swaggo/swag/cmd/swag@v1.16.4 init --dir apps/core-api --generalInfo cmd/api/main.go -o apps/core-api/docs
	go run github.com/swaggo/swag/cmd/swag@v1.16.4 init --dir apps/order-service --generalInfo cmd/order/main.go -o apps/order-service/docs
	go run github.com/swaggo/swag/cmd/swag@v1.16.4 init --dir apps/payment-service --generalInfo cmd/payment/main.go -o apps/payment-service/docs
	go run github.com/swaggo/swag/cmd/swag@v1.16.4 init --dir apps/inventory-service --generalInfo cmd/inventory/main.go -o apps/inventory-service/docs
