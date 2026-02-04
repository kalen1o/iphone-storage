# Approach 2: High-Performance Microservices Stack with NGINX

## Overview

Microservices architecture designed for sustained high-volume traffic, offering granular control over scaling and performance using NGINX as the API gateway.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Remix.run + React 18 | Optimistic UI, nested routing, better data loading |
| **API Gateway** | NGINX (OpenResty) | High performance, JWT auth, rate limiting, Lua scripting |
| **Backend Services** | Go (Golang) | High performance, low latency |
| **Database** | PostgreSQL + Redis | Primary + cache layer |
| **Queue** | Apache Kafka | High-throughput event streaming |
| **Load Balancing** | NGINX | Configurable L7 routing |
| **CDN** | CloudFront + MediaStore | Optimized for large assets |
| **Observability** | Prometheus + Grafana + Jaeger | Full observability stack |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CloudFront CDN (Global)                          │
│                Static Assets, Images, GraphQL BFF, Webhooks                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   Kubernetes Cluster  │
                              │   (EKS / GKE)         │
                              │                       │
    ┌─────────────────────────┼─────────────────────────┼────────────────────┐
    │                         │                         │                    │
┌───▼────┐            ┌──────▼──────┐           ┌──────▼──────┐      ┌────────▼─────────┐
│ Ingress│            │  NGINX API  │           │  Service   │      │   Inventory      │
│Gateway │◄───────────│  Gateway    │           │  Mesh      │      │   Service        │
│(Nginx) │            │(OpenResty) │           │  (Istio)   │      │   (Go + Redis)   │
└───┬────┘            └──────┬──────┘           └──────┬──────┘      └────────┬─────────┘
    │                       │                          │                     │
    │         ┌─────────────┼─────────────┐           │                     │
    │         │             │             │           │                     │
    │    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        ┌──────▼──────┐
    │    │ Product │  │  User   │  │  Order  │  │ Payment │        │   Redis     │
    │    │ Service │  │ Service │  │ Service │  │ Service │        │  Cluster    │
    │    │ (Go)    │  │ (Go)    │  │ (Go)    │  │ (Node)  │        │  (Redis +  │
    │    │         │  │         │  │         │  │         │        │   Sentinel) │
    │    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        └──────┬──────┘
    │         │             │             │             │                    │
    │         └─────────────┼─────────────┼─────────────┘                    │
    │                       │             │                                │
    │                ┌──────▼──────┐  ┌────▼───────────────────┐            │
    │                │   Primary   │  │   Read Replicas        │            │
    │                │ PostgreSQL  │◄─┤   (3 nodes)             │            │
    │                │   (HA)      │  └────────────────────────┘            │
    │                └──────┬──────┘                                        │
    │                       │                                               │
    │         ┌─────────────┼─────────────┐                                  │
    │         │             │             │                                  │
    │    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐                             │
    │    │  Kafka  │  │  Kafka  │  │  Kafka  │                             │
    │    │ Broker 1│  │ Broker 2│  │ Broker 3│                             │
    │    │         │  │         │  │         │                             │
    │    └────┬────┘  └────┬────┘  └────┬────┘                             │
    │         │             │             │                                 │
    │         └─────────────┼─────────────┘                                 │
    │                       │                                               │
    │               ┌───────▼────────┐                                     │
    │               │  Consumer     │                                     │
    │               │  Services     │                                     │
    │               │  - Email      │                                     │
    │               │  - Analytics  │                                     │
    │               │  - Reports    │                                     │
    │               └────────────────┘                                     │
    │                                                                      │
    └──────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. NGINX API Gateway with OpenResty

```nginx
# nginx.conf for API Gateway

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_anonymous_limit:10m rate=50r/m;
limit_req_zone $user_id zone=api_user_limit:10m rate=1000r/m;
limit_req_zone $user_id zone=inventory_user_limit:10m rate=100r/m;

# Upstream services
upstream product_service {
    least_conn;
    server product-service-1:8080;
    server product-service-2:8080;
    server product-service-3:8080;
    keepalive 32;
}

upstream user_service {
    least_conn;
    server user-service-1:8080;
    server user-service-2:8080;
    keepalive 32;
}

upstream order_service {
    least_conn;
    server order-service-1:8080;
    server order-service-2:8080;
    server order-service-3:8080;
    keepalive 32;
}

upstream inventory_service {
    least_conn;
    server inventory-service-1:8080;
    server inventory-service-2:8080;
    server inventory-service-3:8080;
    keepalive 32;
}

upstream payment_service {
    least_conn;
    server payment-service-1:8080;
    server payment-service-2:8080;
    keepalive 32;
}

# Main server configuration
server {
    listen 80;
    listen 443 ssl http2;
    server_name api.iphone-store.com;

    # SSL configuration
    ssl_certificate /etc/nginx/ssl/api-iphone-store.crt;
    ssl_certificate_key /etc/nginx/ssl/api-iphone-store.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # Prometheus metrics endpoint
    location /metrics {
        access_log off;
        stub_status on;
        allow 10.0.0.0/8;  # Internal network only
        deny all;
    }

    # Product API endpoints
    location /api/products/ {
        # Rate limiting for anonymous users
        limit_req zone=api_anonymous_limit burst=10 nodelay;

        # CORS
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type";

        # Proxy settings
        proxy_pass http://product_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_http_version 1.1;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Error handling
        proxy_intercept_errors on;
        error_page 502 503 504 =503 /api/products/503;
    }

    # Order API endpoints (requires authentication)
    location /api/orders/ {
        # Rate limiting for authenticated users (set in Lua)
        limit_req zone=api_user_limit burst=50 nodelay;

        # JWT authentication with Lua
        access_by_lua_block {
            local jwt = require "resty.jwt"

            -- Get token from Authorization header
            local auth_header = ngx.var.http_authorization
            if not auth_header then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Missing authorization header")
                ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end

            -- Extract Bearer token
            local token = string.match(auth_header, "Bearer (.+)")
            if not token then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Invalid authorization header")
                ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end

            -- Validate JWT
            local jwt_obj = jwt:verify("your-jwt-secret-key", token)

            if not jwt_obj.valid then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Invalid token: " .. (jwt_obj.reason or "unknown"))
                ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end

            -- Extract user ID and set as variable
            ngx.var.user_id = jwt_obj.payload.sub or jwt_obj.payload.user_id

            -- Add user info to headers for backend services
            ngx.req.set_header("X-User-Id", ngx.var.user_id)
            ngx.req.set_header("X-User-Email", jwt_obj.payload.email or "")
            ngx.req.set_header("X-User-Role", jwt_obj.payload.role or "user")
        }

        # Proxy to Order Service
        proxy_pass http://order_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-User-Id $user_id;
    }

    # Inventory API endpoints (critical - strict rate limiting)
    location /api/inventory/ {
        # Very strict rate limiting
        limit_req zone=inventory_user_limit burst=5 nodelay;

        # Only allow authenticated requests
        access_by_lua_block {
            if not ngx.var.user_id then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Authentication required")
                ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end
        }

        # Proxy to Inventory Service
        proxy_pass http://inventory_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-User-Id $user_id;
    }

    # Payment API endpoints (webhook from Stripe)
    location /api/payments/webhook {
        # No rate limiting for webhooks
        # Validate Stripe webhook signature
        access_by_lua_block {
            local cjson = require "cjson"
            local hmac = require "resty.hmac"

            -- Get Stripe signature
            local sig_header = ngx.var.http_stripe_signature
            if not sig_header then
                ngx.status = ngx.HTTP_BAD_REQUEST
                ngx.say("Missing Stripe signature")
                ngx.exit(ngx.HTTP_BAD_REQUEST)
            end

            -- Read request body
            ngx.req.read_body()
            local body = ngx.req.get_body_data()

            -- Verify signature (simplified)
            -- In production, use Stripe SDK or proper HMAC verification
            local webhook_secret = "whsec_your_webhook_secret"
            local expected_sig = hmac:new(webhook_secret):final(body, false)

            if string.find(sig_header, expected_sig) == nil then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Invalid webhook signature")
                ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end
        }

        # Proxy to Payment Service
        proxy_pass http://payment_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Prometheus metrics endpoint configuration
server {
    listen 9113;
    server_name localhost;

    location /metrics {
        stub_status on;
        access_log off;
        allow 10.0.0.0/8;
        deny all;
    }
}
```

### 2. Inventory Service with Distributed Locking

```go
// Go: Redis Redlock implementation
func (s *InventoryService) ReserveInventory(ctx context.Context, productID string, quantity int) error {
    // Try to acquire distributed lock
    lockKey := fmt.Sprintf("lock:inventory:%s", productID)
    lock := s.redlock.NewLock(lockKey, 5*time.Second)

    err := lock.Lock(ctx)
    if err != nil {
        return fmt.Errorf("could not acquire lock: %w", err)
    }
    defer lock.Unlock(ctx)

    // Check inventory
    available, err := s.redis.Get(ctx, fmt.Sprintf("inventory:%s", productID)).Int()
    if err != nil {
        return err
    }

    if available < quantity {
        return ErrInsufficientInventory
    }

    // Atomic decrement
    _, err = s.redis.DecrBy(ctx, fmt.Sprintf("inventory:%s", productID), quantity).Result()
    if err != nil {
        return err
    }

    // Publish inventory update event
    s.kafka.Publish(ctx, "inventory-updated", InventoryEvent{
        ProductID: productID,
        Quantity:  -quantity,
    })

    return nil
}
```

### 3. Event-Driven Order Processing

```go
// Kafka event-based order flow
type OrderCreatedEvent struct {
    OrderID    string    `json:"order_id"`
    UserID     string    `json:"user_id"`
    ProductID  string    `json:"product_id"`
    Quantity   int       `json:"quantity"`
    Timestamp  time.Time `json:"timestamp"`
}

// Order service publishes event
func (s *OrderService) CreateOrder(req CreateOrderRequest) (*Order, error) {
    order := &Order{
        ID:        generateUUID(),
        UserID:    req.UserID,
        ProductID: req.ProductID,
        Quantity:  req.Quantity,
        Status:    OrderStatusPending,
    }

    // Save to database
    err := s.repo.Create(order)
    if err != nil {
        return nil, err
    }

    // Publish event to Kafka
    event := OrderCreatedEvent{
        OrderID:   order.ID,
        UserID:    order.UserID,
        ProductID: order.ProductID,
        Quantity:  order.Quantity,
        Timestamp: time.Now(),
    }

    s.producer.Produce("orders.created", event)

    return order, nil
}

// Payment service consumes and processes
func (s *PaymentService) HandleOrderCreated(event OrderCreatedEvent) error {
    paymentIntent, err := s.stripe.CreatePaymentIntent(event.OrderID, event.Amount)
    if err != nil {
        // Publish failure event
        s.producer.Produce("orders.payment_failed", OrderFailedEvent{
            OrderID: event.OrderID,
            Reason:  err.Error(),
        })
        return err
    }

    // Publish success event
    s.producer.Produce("orders.payment_succeeded", PaymentSucceededEvent{
        OrderID:      event.OrderID,
        PaymentID:    paymentIntent.ID,
        Amount:       paymentIntent.Amount,
    })

    return nil
}
```

### 4. High-Performance Frontend with Remix

```typescript
// Remix route loader for product page
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const productId = params.id;
  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === 'true';

  // Parallel data fetching
  const [product, inventory, recommendations] = await Promise.all([
    fetch(`/api/products/${productId}`).then(r => r.json()),
    fetch(`/api/inventory/${productId}`).then(r => r.json()),
    fetch(`/api/products/${productId}/recommendations`).then(r => r.json())
  ]);

  return json({ product, inventory, recommendations });
};

// Optimistic UI for add to cart
function addToCart(productId: string) {
  const formData = new FormData();
  formData.append('productId', productId);

  const optimisticData = { cartCount: cartCount + 1 };

  // Optimistically update UI
  setCartCount(optimisticData.cartCount);

  fetch('/api/cart', {
    method: 'POST',
    body: formData
  }).catch(() => {
    // Rollback on error
    setCartCount(cartCount);
  });
}
```

### 5. Traffic Spike Handling

**Autoscaling Configuration (Kubernetes HPA):**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-api-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx-api-gateway
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: inventory-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: inventory-service
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**NGINX Horizontal Pod Autoscaler Configuration:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-api-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx-api-gateway
  minReplicas: 2
  maxReplicas: 20
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 4
        periodSeconds: 30
      selectPolicy: Max
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: nginx_requests_per_second
      target:
        type: AverageValue
        averageValue: "5000"
```

## NGINX API Gateway Benefits

### Performance Advantages

1. **Highest Throughput**
   - 50,000+ requests per second per instance
   - Sub-millisecond latency for simple routing
   - Connection pooling with upstream services

2. **Low Resource Usage**
   - Base memory: 10-20MB
   - CPU usage: 5-10% under load
   - Minimal overhead compared to Kong

3. **SSL Termination**
   - Native SSL/TLS support
   - HTTP/2 support out of box
   - Efficient certificate handling

4. **Load Balancing**
   - Multiple algorithms: least_conn, ip_hash, round-robin
   - Health checks built-in
   - Automatic failover

### Feature Set with OpenResty

1. **JWT Authentication**
   - Validate JWT tokens in Lua
   - Extract user info and pass to backend
   - Automatic token refresh support

2. **Rate Limiting**
   - Per-IP rate limiting
   - Per-user rate limiting (from JWT)
   - Redis-backed distributed rate limiting

3. **Request/Response Transformation**
   - Modify headers
   - Transform request bodies
   - Add custom headers (user info from JWT)

4. **Advanced Routing**
   - Path-based routing
   - Header-based routing
   - Regex matching
   - Conditional routing

5. **Caching**
   - Response caching
   - Microcaching
   - Cache invalidation support

## Service Breakdown

### Product Service (Go)
- Handles product catalog management
- Serves product details and pricing
- Manages product images and metadata
- Integrates with search (Algolia/Elasticsearch)

### User Service (Go)
- User authentication and authorization
- Profile management
- Order history
- Wishlist and preferences

### Order Service (Go)
- Order creation and management
- Order status tracking
- Order fulfillment logic
- Integration with payment and inventory services

### Payment Service (Node.js)
- Payment intent creation
- Webhook processing
- Refund handling
- Payment history

### Inventory Service (Go + Redis)
- Real-time inventory tracking
- Reservation and release logic
- Distributed locking
- Inventory event publishing

## Observability Stack

```yaml
# Prometheus configuration for NGINX
scrape_configs:
  - job_name: 'nginx-api-gateway'
    static_configs:
      - targets: ['nginx-api-gateway:9113']
    metrics_path: '/metrics'

  - job_name: 'product-service'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: product-service

  - job_name: 'order-service'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: order-service

# Alerting rules
groups:
  - name: nginx_alerts
    rules:
      - alert: NginxHighErrorRate
        expr: rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: NGINX error rate above 5%

      - alert: NginxHighLatency
        expr: histogram_quantile(0.95, rate(nginx_http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: NGINX p95 latency above 500ms

  - name: inventory_alerts
    rules:
      - alert: InventoryMismatch
        expr: inventory_reserved != inventory_committed
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Inventory reservation mismatch detected

      - alert: HighOrderFailureRate
        expr: rate(order_failures_total[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: Order failure rate above 5%
```

## Pros & Cons

### Pros
- **Highest performance**: NGINX offers fastest API gateway
- **Horizontal scaling**: Independent scaling of services
- **Technology flexibility**: Use best language for each service
- **Fault isolation**: Failure in one service doesn't bring down entire system
- **Team autonomy**: Different teams can work on different services
- **Observability**: Full tracing and monitoring across services
- **Event-driven**: Async processing with Kafka
- **Lower cost**: NGINX is free and lightweight
- **Control**: Full control over NGINX configuration

### Cons
- **High complexity**: More moving parts to manage
- **DevOps intensive**: Requires Kubernetes expertise
- **Development time**: 3-6 months to build properly
- **Operational overhead**: Managing multiple services, databases, and infrastructure
- **Network latency**: Service-to-service communication overhead
- **Debugging complexity**: Tracing issues across multiple services
- **Consistency challenges**: Distributed transactions and data consistency
- **NGINX configuration**: Requires Lua scripting for advanced features

## Best Use Case

- **Sustained high volume** (10K+ concurrent users)
- **Complex business logic** requiring separate services
- **Multi-region deployment** requirements
- **Custom performance optimization** needs
- **Dedicated DevOps/SRE team** available
- **Performance is critical** (NGINX advantage)

## Team Requirements

- **Senior Go developers**: 2-3 developers
- **NGINX/Lua developers**: 1-2 developers (for gateway)
- **Kubernetes experts**: 1-2 SRE/DevOps engineers
- **Full-stack frontend developers**: 1-2 developers
- **Total team size**: 5-8 people

## Estimated Costs

**Development Phase (6 months):**
- Kubernetes cluster (EKS/GKE): $2000-5000/month
- Development database: $100-300/month
- Kafka cluster: $500-1000/month
- NGINX/OpenResty instances: $200-500/month
- Monitoring (Prometheus + Grafana): $0-200 (self-hosted) or $500-1000 (managed)
- CI/CD (GitLab CI/GitHub Actions): $0-100/month
- Total Development: $2600-7100/month

**Production Launch:**
- Kubernetes cluster (3 nodes + auto-scaling): $3000-8000/month
- Production database (PostgreSQL HA): $500-1500/month
- Redis cluster: $300-800/month
- Kafka cluster (3 brokers): $1000-2500/month
- NGINX API Gateway (5 instances): $500-1500/month
- CloudFront CDN: $200-1000/month
- Monitoring & logging: $500-1500/month
- Load balancers (ALB/NLB): $200-500/month

**Total Production Launch: $6200-16800/month**

**High Volume (100K+ concurrent):**
- Kubernetes cluster (20+ nodes): $15000-40000/month
- Database with read replicas: $2000-5000/month
- Redis cluster: $1000-3000/month
- Kafka cluster (5+ brokers): $3000-8000/month
- NGINX API Gateway (20 instances): $2000-6000/month
- CDN and edge services: $1000-5000/month
- Monitoring at scale: $2000-5000/month

**Total High Volume: $26000-71000/month**

## Scalability Plan

| Metric | Current Config | Scale to 100K Users | Scale to 1M Users |
|--------|----------------|---------------------|-------------------|
| **Frontend** | 2 replicas | 5 replicas | 10+ replicas |
| **NGINX API Gateway** | 2 instances | 5 instances | 10+ instances |
| **Product Service** | 3 replicas | 6 replicas | 12+ replicas |
| **Order Service** | 5 replicas | 10 replicas | 20+ replicas |
| **Inventory Service** | 5 replicas | 10 replicas | 20+ replicas |
| **Payment Service** | 3 replicas | 5 replicas | 10+ replicas |
| **Database** | 1 primary + 2 replicas | 1 primary + 4 replicas | 1 primary + 8 replicas |
| **Redis** | 1 cluster (3 shards) | 2 clusters (6 shards) | 3 clusters (12 shards) |
| **Kafka** | 3 brokers | 5 brokers | 9 brokers |

## Comparison: NGINX vs Kong in this Architecture

| Aspect | NGINX (This Approach) | Kong (Alternative) |
|--------|---------------------|-------------------|
| **Performance** | 50K+ RPS | 30K+ RPS |
| **Latency (p95)** | 5-10ms | 15-25ms |
| **Memory** | 10-20MB | 50-100MB |
| **Cost** | Free | Free or $5K/yr Enterprise |
| **JWT Auth** | Lua script required | Built-in plugin |
| **Rate Limiting** | Built-in + Lua | Built-in advanced |
| **Configuration** | Config files | API + UI |
| **Learning Curve** | Moderate | Steep |
| **Best For** | Performance-focused | API management |

## Why NGINX for iPhone 17 Pro Max Store

1. **Performance is Critical**
   - Product launches require maximum throughput
   - Need to handle instant traffic spikes
   - Every millisecond matters

2. **Sufficient Feature Set**
   - JWT authentication can be implemented with Lua
   - Advanced rate limiting with OpenResty
   - No need for OAuth2/OIDC (JWT is enough)
   - No need for developer portal

3. **Cost Efficiency**
   - NGINX is free and lightweight
   - Lower resource requirements
   - No Enterprise license needed

4. **Team Fit**
   - Your DevOps team (1-2 engineers) can manage NGINX
   - Familiar technology for many teams
   - Good documentation and community support

5. **Flexibility**
   - Full control over configuration
   - Custom Lua scripts for any requirement
   - No vendor lock-in
