# Approach 4: Implementation Guides

This directory contains step-by-step implementation guides for building the **Simplified Service-Oriented Stack with NGINX Gateway + Lightweight Kafka Microservices**.

## Overview

These guides walk you through implementing a production-ready online storage system using:
- **Remix.run + React 18** - Modern frontend with server-side rendering
- **NGINX API Gateway** - Central entry point with TLS termination and routing
- **Go/Node.js Services** - Separate backend applications for core API, orders, payments, and inventory
- **PostgreSQL** - Shared database for all services
- **Apache Kafka** - Event-driven communication between services
- **Docker & Docker Compose** - Container orchestration

## Implementation Order

Follow these guides in order to build the complete system:

### 1. Overview & Prerequisites
**File:** [00-overview-and-prerequisites.md](./00-overview-and-prerequisites.md)

Learn about:
- System architecture and components
- Required software and tools
- Project structure overview
- Implementation sequence
- Getting started instructions

### 2. Infrastructure Setup
**File:** [01-infrastructure-setup.md](./01-infrastructure-setup.md)

Set up foundational infrastructure:
- Docker Compose configuration for all services
- Kafka and Zookeeper setup
- Shared configuration module
- Shared logging module
- Makefile for common operations
- Environment management

### 3. Database Setup
**File:** [02-database-setup.md](./02-database-setup.md)

Create the database layer:
- PostgreSQL schema and migrations
- Seed data for development
- Go database module
- Repository pattern implementation
- Maintenance scripts and backups

### 4. Kafka Setup
**File:** [03-kafka-setup.md](./03-kafka-setup.md)

Implement event-driven messaging:
- Kafka topics configuration
- Go Kafka producer module
- Go Kafka consumer module
- Event models and schemas
- Testing utilities

### 5. NGINX Gateway
**File:** [04-nginx-gateway.md](./04-nginx-gateway.md)

Build the API gateway:
- Main NGINX configuration
- HTTP to HTTPS redirect
- API route configuration
- Frontend routing
- SSL certificates (development and production)
- Rate limiting and caching

### 6. Core API Service
**File:** [05-core-api.md](./05-core-api.md)

Implement primary HTTP surface:
- Go module initialization
- Data models (User, Product, Order)
- HTTP handlers for all endpoints
- JWT authentication middleware
- CORS and logging middleware
- Database repository

**Endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/products` - List products
- `GET /api/products/{id}` - Get product details
- `POST /api/orders` - Create order
- `GET /api/orders/{id}` - Get order details

### 7. Order Service
**File:** [06-order-service.md](./06-order-service.md)

Build order lifecycle management:
- Order business logic
- Kafka consumer for order events
- Kafka producer for order status updates
- Database repository
- Event handling for payment and inventory updates

**Events:**
- Consumes: `orders.created`, `payments.succeeded`, `payments.failed`, `inventory.reserved`, `inventory.out_of_stock`
- Produces: `orders.paid`, `orders.cancelled`, `orders.shipped`

### 8. Payment Service
**File:** [07-payment-service.md](./07-payment-service.md)

Implement payment processing:
- Stripe integration
- Payment business logic
- Webhook handling
- Kafka event publishing
- Database repository

**Events:**
- Consumes: `orders.created`
- Produces: `payments.initiated`, `payments.succeeded`, `payments.failed`

### 9. Inventory Service
**File:** [08-inventory-service.md](./08-inventory-service.md)

Create inventory management:
- Stock reservation logic
- Inventory adjustments
- Row-level locking for consistency
- Kafka event integration
- Database repository

**Events:**
- Consumes: `orders.created`, `orders.cancelled`
- Produces: `inventory.reserved`, `inventory.released`, `inventory.out_of_stock`, `inventory.adjusted`

### 10. Remix Frontend
**File:** [09-remix-frontend.md](./09-remix-frontend.md)

Build modern user interface:
- Remix + React application setup
- Tailwind CSS configuration
- API client and service layer
- Reusable UI components
- Route pages (Home, Products, Product Detail, Cart, Checkout, Orders)
- Layout components (Header, Footer)

### 11. Deployment
**File:** [10-deployment.md](./10-deployment.md)

Deploy to production:
- Production server setup
- SSL certificate configuration with Let's Encrypt
- Docker Compose deployment
- Environment configuration
- Payment provider setup
- Monitoring and logging
- Security hardening
- Performance optimization
- CI/CD pipeline setup
- Rollback procedures

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/yourusername/online-storage.git
cd online-storage

# 2. Follow implementation guides in order
# Start with: 00-overview-and-prerequisites.md

# 3. For local development:
make up

# 4. For production deployment:
# Follow: 10-deployment.md
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                                                    │
│  ┌──────────────┐                                    │
│  │  Remix       │  Browser                       │
│  │  Frontend    │◄───────────────────────────────────────┤
│  │  (SSR)      │  HTTPS                          │
│  └──────┬───────┘                                    │
│         │                                             │
│         │ HTTPS (REST / JSON)                          │
│  ┌──────▼──────────────┐                             │
│  │  NGINX Gateway    │  ┌──────────────┐         │
│  │  - TLS            │  │  Core API   │         │
│  │  - Routing        │◄─┤  (HTTP)     │         │
│  │  - Rate Limit     │  │              │         │
│  └──────┬──────────────┘  └──────┬───────┘         │
│         │                        │                         │
│         │                        │ Kafka                   │
│         │                   ┌────▼────┐                   │
│         │                   │  Kafka   │  ┌─────────────┐      │
│  ┌──────┴────────────────┤  Cluster  │  │  PostgreSQL │      │
│  │                         │           │◄─┤  Database   │      │
│  │  ┌────────────────┴───────┐   │   └─────────────┘      │
│  │  │Order     │Payment    │   │                          │
│  │  │Service   │Service    │   │                          │
│  │  └──────────┴───────────┘   │                          │
│  └─────────────────────────────────┘                          │
└───────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|--------|-------------|---------|
| **Frontend** | Remix + React 18 | SSR, nested routing, data loading |
| **API Gateway** | NGINX 1.25+ | TLS termination, routing, rate limiting |
| **Core API** | Go 1.21+ | Primary HTTP surface, business logic |
| **Domain Services** | Go 1.21+ | Order, Payment, Inventory services |
| **Messaging** | Apache Kafka 7.5+ | Event-driven communication |
| **Database** | PostgreSQL 16+ | Data persistence |
| **Cache** | Redis 7+ (Optional) | Performance optimization |
| **Container** | Docker 24+ | Application containerization |
| **Orchestration** | Docker Compose 2.20+ | Service orchestration |

## Development Workflow

```bash
# Start all services
make up

# View logs
make logs

# Restart services
make restart

# Stop services
make down

# Build services
make build

# Run database migrations
make db-migrate

# Create Kafka topics
make kafka-topics

# Test NGINX configuration
make nginx-config-test

# Reload NGINX
make nginx-reload
```

## Testing

```bash
# Test API endpoints
curl http://localhost:8080/health
curl http://localhost:8080/api/products

# Test frontend
open http://localhost:3000

# Test Kafka topics
make kafka-list-topics

# Test database connection
make db-connect
```

## Troubleshooting

For specific issues, refer to the troubleshooting sections in each guide:
- [Infrastructure Issues](./01-infrastructure-setup.md#troubleshooting)
- [Database Issues](./02-database-setup.md#troubleshooting)
- [Kafka Issues](./03-kafka-setup.md#troubleshooting)
- [NGINX Issues](./04-nginx-gateway.md#troubleshooting)
- [Core API Issues](./05-core-api.md#troubleshooting)
- [Order Service Issues](./06-order-service.md#troubleshooting)
- [Payment Service Issues](./07-payment-service.md#troubleshooting)
- [Inventory Service Issues](./08-inventory-service.md#troubleshooting)
- [Frontend Issues](./09-remix-frontend.md#troubleshooting)
- [Deployment Issues](./10-deployment.md#troubleshooting)

## Contributing

When contributing to this implementation:
1. Follow the existing code style and patterns
2. Update relevant documentation
3. Add tests for new features
4. Follow Git commit conventions
5. Update CHANGELOG.md

## License

This implementation is provided as-is for educational and commercial use. Refer to your project's specific licensing terms.

## Support

For questions or issues:
- Check the troubleshooting sections in each guide
- Review application logs: `docker-compose logs`
- Check service health: `curl http://localhost:8080/health`
- Refer to the main approach document: [approach-4-simpler-stack.md](../approach-4-simpler-stack.md)

---

**Next:** Start with [00-overview-and-prerequisites.md](./00-overview-and-prerequisites.md) to begin implementing your online storage system.
