# Approach 4: Simplified Service-Oriented Stack with NGINX Gateway + Lightweight Kafka Microservices

## Overview

This approach keeps many of the **domain boundaries and performance ideas** from the microservices stack, but implements them in a **simpler, low-ops microservices architecture**:

- A **small number of separate backend apps** (e.g., `core-api`, `order-service`, `payment-service`, `inventory-service`) instead of one monolith.
- A modern **Remix + React** frontend talking to the backend through an **NGINX API gateway**.
- A shared **PostgreSQL** database (optionally with Redis later) instead of multiple independent data stores.
- **Kafka** is used only for **service-to-service communication and async workflows**, not as the center of everything.
- A **single NGINX API gateway** in front of the services for routing, TLS termination, and basic rate limiting.
- **No Kubernetes, no service mesh**, and a **much simpler NGINX configuration** than the full OpenResty-based gateway in Approach 2—still deployable with simple containers/VMs or VMs.

This is ideal when you want **separate backend apps**, **NGINX as a gateway**, and **Kafka-based communication** for critical flows, but **don’t yet need** the operational complexity of the full microservices + advanced NGINX/OpenResty + heavy Kafka cluster setup.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Remix.run + React 18 | Great DX, nested routing, data loading, optimistic UI |
| **API Gateway** | NGINX | TLS termination, routing to services, basic rate limiting and headers |
| **Core API** | Go or Node.js (`core-api` service) | Primary HTTP surface behind NGINX, aggregates data from other services |
| **Domain Services** | Go or Node.js (e.g., `order-service`, `payment-service`, `inventory-service`) | Separate deployables for key domains; still small in number |
| **Service-to-Service Messaging** | Apache Kafka | Reliable async communication between services; decoupled workflows |
| **Database** | PostgreSQL (shared schema or schemas per domain) | Single cluster for all services to reduce ops overhead |
| **Cache (Optional)** | Redis | Add later for hot paths (inventory, sessions, rate limiting) |
| **Background Jobs (Optional)** | Kafka consumers / lightweight workers | For emails, reports, and other async workflows |
| **Observability** | Basic metrics + structured logs | Start simple; add Prometheus/Grafana/Jaeger only if needed |

## High-Level Architecture

```text
┌─────────────────────────────┐
│        Remix Frontend       │
│  (SSR + client-side React)  │
└───────────────┬─────────────┘
                │  HTTPS (REST / JSON)
        ┌───────▼─────────────┐
        │  NGINX API Gateway  │
        │  - TLS termination  │
        │  - Routing          │
        │  - Basic rate limit │
        └───────┬─────────────┘
                │  HTTP (internal)
┌───────────────▼─────────────┐
│          Core API           │
│  - Product HTTP endpoints   │
│  - User HTTP endpoints      │
│  - Cart + checkout flows    │
└───────────────┬─────────────┘
                │
        ┌───────┴─────────────────────────────────┐
        │                                         │
┌───────▼────────────┐                    ┌───────▼────────────┐
│   Order Service    │◄─ Kafka topics ───►│   Payment Service  │
│  (orders.created,  │                    │  (payments.*)      │
│   orders.updated)  │                    └────────────────────┘
└──────────────┬─────┘
               │
        ┌──────▼────────────┐
        │ Inventory Service │
        │ (inventory.*)     │
        └───────────┬───────┘
                    │
          ┌─────────▼─────────┐
          │    PostgreSQL     │
          │ (shared database) │
          └─────────┬─────────┘
                    │
             ┌──────▼───────┐
             │ Redis (opt)  │
             │  Cache       │
             └──────────────┘
```

### Separate Backend Apps with NGINX Gateway + Kafka Communication

Instead of one backend app, you run a **small set of services**:

- `nginx-gateway`:
  - Terminates TLS and exposes the public API surface.
  - Routes incoming requests to `core-api` (and optionally a few other services) based on path/host.
  - Applies basic rate limiting, request size limits, and security headers.
- `core-api`: 
  - Owns HTTP endpoints used by the frontend (behind NGINX).
  - Performs synchronous reads from PostgreSQL and Redis.
  - Emits events to Kafka (e.g., `orders.created`) for downstream processing.
- `order-service`:
  - Consumes `orders.created` and manages order lifecycle.
  - Emits `orders.paid`, `orders.cancelled`, etc.
- `payment-service`:
  - Handles payment intents and provider webhooks.
  - Consumes `orders.created` or `orders.payment_required`.
  - Emits `payments.succeeded`, `payments.failed`.
- `inventory-service`:
  - Owns inventory adjustments and reservations.
  - Consumes `orders.created` / `orders.cancelled`.
  - Emits `inventory.reserved`, `inventory.released`, `inventory.out_of_stock`.

Kafka is the **primary communication channel** for these backend apps, but the **frontend only talks to NGINX**, which then routes to `core-api` and other internal services over HTTP, keeping the external surface small and simple.

## Example Service Layout (Go)

```text
services/
  nginx-gateway/
    nginx.conf
  core-api/
    cmd/api/main.go
    internal/http/
    internal/product/
    internal/user/
  order-service/
    cmd/order/main.go
    internal/order/
    internal/kafka/
  payment-service/
    cmd/payment/main.go
    internal/payment/
    internal/kafka/
  inventory-service/
    cmd/inventory/main.go
    internal/inventory/
    internal/kafka/
shared/
  db/
  kafka/
  logging/
  config/
```

## Key Design Choices (Compared to Approach 2 Microservices Stack)

### 1. No Dedicated NGINX/OpenResty API Gateway

- **What’s different from Approach 2:** 
  - You still use **NGINX as a gateway**, but:
    - Configuration is intentionally kept **minimal** (TLS, routing, simple rate limits, basic headers).
    - No heavy Lua scripting or advanced OpenResty features.
    - No service mesh or Kubernetes-specific ingress setup.
- **Responsibility split:**
  - NGINX: TLS, routing, coarse rate limits, basic security headers.
  - `core-api`: business logic, JWT verification, fine-grained authorization, response shaping.
- **Why:** 
  - You get the key benefits of a gateway (central entrypoint, TLS offload, routing) without the full complexity of the Approach 2 configuration.

### 2. Kafka for Service-to-Service Communication (But Kept Simple)

- **What’s different from Approach 2:** Kafka is used **only** for:
  - Order lifecycle events.
  - Payment status events.
  - Inventory reservation/adjustment events.
- **Not used for:**
  - Frontend communication.
  - Every small internal action.
- **Patterns:**
  - Each service subscribes to a **small number of topics**.
  - Topics are named by domain (`orders.*`, `payments.*`, `inventory.*`).
  - Idempotent consumers to safely handle retries.

This keeps Kafka powerful but **narrowly scoped**, reducing mental and operational overhead compared to a fully event-driven everything architecture.

### 3. Shared PostgreSQL Database (at Least Initially)

- **What’s different from a purist microservices design:** All services talk to the **same PostgreSQL cluster**, potentially with:
  - Separate schemas per service, or
  - Clear table ownership conventions.
- **Why:**
  - Fewer database clusters to manage.
  - Simpler analytics and reporting.
  - Still allows you to later split databases by moving owned tables into a new cluster when needed.

You can gradually migrate from a shared database to **database-per-service** if/when cross-service coupling becomes a bottleneck.

### 4. Inventory and Ordering with Database Transactions + Kafka

You can still avoid complex distributed locking systems by combining **PostgreSQL row-level locks** with **Kafka events**:

```sql
-- Reserve inventory atomically in PostgreSQL
UPDATE inventory
SET available = available - :qty
WHERE product_id = :product_id
  AND available >= :qty;
```

If the update affects 1 row, `inventory-service` emits `inventory.reserved` to Kafka; otherwise it emits `inventory.out_of_stock`. `order-service` reacts to these events to confirm or cancel orders.

### 5. Simple Observability First

Start with:

- **Structured logs** (JSON) with correlation IDs: `trace_id`, `order_id`, `user_id`.
- Basic **HTTP metrics** in `core-api` and basic **consumer lag/error metrics** for Kafka in each service.

You only add Prometheus, Grafana, and tracing if:

- Kafka topics and services proliferate, or
- Incidents become hard to debug with logs alone.

## Pros & Cons

### Pros

- **Separate backend apps** with clear domain responsibilities (order, payment, inventory, core API).
- **Kafka-based communication** enables async workflows and decoupled services.
- **Simpler than full-blown Approach 2**: no NGINX/OpenResty gateway, no service mesh, no per-service databases.
- **Good migration path**: can later add NGINX, more topics, or split the database as needed.
- **Operationally manageable** for a small team: a handful of services + one Kafka cluster + one PostgreSQL cluster.

### Cons

- **More complexity than a single backend app**: multiple deployables, Kafka to operate, and inter-service contracts to manage.
- **Shared database coupling**: still some cross-service coupling at the data layer until you split databases.
- **Event-driven debugging**: tracing bugs across Kafka topics and services is harder than debugging a single process.
- **Requires basic Kafka expertise**: topic design, consumer groups, and monitoring must be understood.

## Best Use Case

- Early to mid-stage product where:
  - You want **separate backend apps** (order, payment, inventory, core API).
  - You need **Kafka-based communication** for order, payment, and inventory workflows.
  - Team size is **small (2–5 engineers)**.
  - Operational simplicity is more important than perfect scalability knobs.
  - Traffic is meaningful but not at the “100K+ concurrent, multi-region” scale yet.
- Teams that want a **migration path**:
  - Start with this **lightweight Kafka microservices** setup.
  - Gradually add NGINX, separate databases, or more services only when truly needed.

## Team Requirements

- **Backend engineers (2–3)**:
  - Comfortable with Go or Node.js.
  - Familiar with HTTP APIs, SQL, basic Kafka concepts.
- **Frontend engineers (1–2)**:
  - Comfortable with Remix + React.
- **Ops-minded engineer (0.5–1 FTE)**:
  - Can own basic monitoring, backups, secrets, environment management, and Kafka operations.

This approach gives you **separate backend apps and Kafka-based communication**, but still trims away the **full deployment complexity** of the more advanced microservices stack, making it a pragmatic “Approach 4” when you want event-driven services without overbuilding the platform.

