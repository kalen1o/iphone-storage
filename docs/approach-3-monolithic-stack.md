# Approach 3: Traditional Enterprise Monolithic Stack

## Overview

Traditional monolithic architecture with proven reliability, suitable for teams with strong Node.js expertise and moderate DevOps resources.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + Vite | Fast build, hot module replacement |
| **Backend** | Node.js (Express/NestJS) | Familiar ecosystem, good async handling |
| **Database** | PostgreSQL + Redis | Proven reliability |
| **Queue** | RabbitMQ | Reliable message delivery |
| **Load Balancing** | AWS ALB + Auto Scaling Groups | AWS-native, easy to manage |
| **CDN** | AWS CloudFront + S3 | Full AWS ecosystem |
| **Caching** | ElastiCache Redis | Managed Redis cluster |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Route 53 (DNS)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   AWS CloudFront     │
                              │   (Global CDN)        │
                              └───────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   Application Load    │
                              │   Balancer (ALB)      │
                              │   (SSL Termination)   │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
           ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
           │  Auto Scaling   │   │  Auto Scaling   │   │  Auto Scaling   │
           │  Group (AZ 1)   │   │  Group (AZ 2)   │   │  Group (AZ 3)   │
           └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                    │                     │                     │
         ┌──────────┼──────────┐          │                     │
         │          │          │          │                     │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐          ┌───▼────┐
    │ Node.js │ │ Node.js│ │ Node.js│ │ Node.js│          │ Node.js│
    │ Instance│ │ Instance│ │ Instance│ │ Instance│          │ Instance│
    └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘          └───┬────┘
         │          │          │          │                     │
         └──────────┼──────────┼──────────┼─────────────────────┘
                    │          │          │
                    │          │          │
         ┌──────────▼──────────▼──────────▼─────────────────────┐
         │                  Backend API                          │
         │  - Products Endpoint (Cached)                         │
         │  - Inventory Endpoint (Transactional)                 │
         │  - Orders Endpoint (Queued)                          │
         │  - Cart Endpoint (Session-based)                     │
         └──────────┬───────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼───────┐  ┌───▼───────┐  ┌───▼────────┐
│ PostgreSQL │  │   Redis   │  │  RabbitMQ  │
│  (RDS)     │  │ (Elasti-  │  │            │
│           │  │  Cache)   │  │  - Orders  │
│ - Products│  │           │  │  - Emails  │
│ - Inventory│  │ - Cache   │  │  - Analytics│
│ - Orders  │  │ - Sessions│  │            │
│ - Users   │  │ - Rate    │  │            │
└───────────┘  │  Limiting │  └────────────┘
               └───────────┘
```

## Key Design Decisions

### 1. Monolithic Application Structure (NestJS)

```typescript
// modules/inventory/inventory.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Inventory, Product])],
  providers: [InventoryService],
  controllers: [InventoryController],
})
export class InventoryModule {}

// modules/inventory/inventory.service.ts
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private inventoryRepo: Repository<Inventory>,
    private redisService: RedisService,
  ) {}

  @Transactional()
  async reserveProduct(productId: string, quantity: number, userId: string) {
    // Cache first check (fast fail)
    const cachedAvailable = await this.redisService.get(`inv:${productId}`);
    if (cachedAvailable && parseInt(cachedAvailable) < quantity) {
      throw new HttpException('Insufficient inventory', HttpStatus.BAD_REQUEST);
    }

    // Database transaction
    const inventory = await this.inventoryRepo
      .createQueryBuilder('inventory')
      .setLock('pessimistic_write')
      .where('inventory.productId = :productId', { productId })
      .getOne();

    if (!inventory || inventory.available < quantity) {
      // Invalidate cache and throw
      await this.redisService.del(`inv:${productId}`);
      throw new HttpException('Insufficient inventory', HttpStatus.BAD_REQUEST);
    }

    // Update inventory
    inventory.available -= quantity;
    inventory.reserved += quantity;
    await this.inventoryRepo.save(inventory);

    // Update cache
    await this.redisService.set(`inv:${productId}`, inventory.available, 60);

    // Queue order processing
    await this.rabbitMQ.publish('orders.queue', {
      type: 'order.created',
      data: { productId, quantity, userId, timestamp: new Date() }
    });

    return { success: true, remaining: inventory.available };
  }
}
```

### 2. RabbitMQ Message Queuing

```typescript
// producers/order.producer.ts
@Injectable()
export class OrderProducer {
  @RabbitRPC({
    exchange: 'orders.exchange',
    routingKey: 'order.created',
    queue: 'orders.processing',
  })
  async publishOrder(orderDto: CreateOrderDto) {
    return { success: true };
  }
}

// consumers/payment.consumer.ts
@Injectable()
export class PaymentConsumer {
  @RabbitSubscribe({
    exchange: 'orders.exchange',
    routingKey: 'order.created',
    queue: 'orders.processing',
  })
  async handleOrderCreated(msg: Record<string, any>) {
    try {
      // Process payment
      const paymentIntent = await this.stripeService.createPaymentIntent(msg);

      // Update order status
      await this.orderService.updateStatus(msg.orderId, 'payment_pending', {
        paymentIntentId: paymentIntent.id
      });

      // Send confirmation email (separate queue)
      await this.emailProducer.sendConfirmation(msg.userId, msg.orderId);

    } catch (error) {
      // Dead letter queue for failed orders
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }
}
```

### 3. Database Optimizations

```sql
-- PostgreSQL indexes for performance
CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_status ON orders(status) WHERE status IN ('pending', 'processing');

-- Partitioning large tables (orders by month)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE orders_2025_01 PARTITION OF orders
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE orders_2025_02 PARTITION OF orders
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Optimized inventory query with CTE
WITH locked_inventory AS (
  SELECT id, product_id, available, reserved
  FROM inventory
  WHERE product_id = $1
  FOR UPDATE
)
UPDATE inventory
SET
  available = available - $2,
  reserved = reserved + $2
WHERE id = (SELECT id FROM locked_inventory)
  AND available >= $2
RETURNING *;
```

### 4. Caching Strategy

```typescript
// Redis caching service
@Injectable()
export class CacheService {
  constructor(@Inject('REDIS') private redis: Redis) {}

  async getProduct(productId: string): Promise<Product | null> {
    // Try cache first
    const cached = await this.redis.get(`product:${productId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - fetch from DB
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (product) {
      // Cache for 1 hour
      await this.redis.setex(`product:${productId}`, 3600, JSON.stringify(product));
    }

    return product;
  }

  async invalidateProduct(productId: string): Promise<void> {
    await this.redis.del(`product:${productId}`);
  }

  async invalidateInventory(productId: string): Promise<void> {
    await this.redis.del(`inventory:${productId}`);
    await this.redis.del(`product:${productId}`);
  }

  // Rate limiting
  async checkRateLimit(userId: string, endpoint: string, limit: number = 10): Promise<boolean> {
    const key = `ratelimit:${userId}:${endpoint}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      // Set expiration on first request
      await this.redis.expire(key, 60); // 1 minute window
    }

    return current <= limit;
  }
}
```

## Application Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── common/                 # Shared utilities
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── decorators/
├── config/                 # Configuration
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── aws.config.ts
├── modules/
│   ├── auth/               # Authentication & authorization
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   └── guards/
│   ├── users/              # User management
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── entities/
│   ├── products/           # Product catalog
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   └── entities/
│   ├── inventory/          # Inventory management
│   │   ├── inventory.controller.ts
│   │   ├── inventory.service.ts
│   │   └── entities/
│   ├── orders/             # Order processing
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts
│   │   ├── entities/
│   │   └── dto/
│   ├── payments/           # Payment processing
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   └── webhooks/
│   └── cart/               # Shopping cart
│       ├── cart.controller.ts
│       ├── cart.service.ts
│       └── entities/
└── database/               # Database migrations
    └── migrations/
```

## Auto Scaling Configuration

```json
// AWS Auto Scaling Group configuration
{
  "AutoScalingGroupName": "iphone-store-asg",
  "MinSize": 2,
  "MaxSize": 50,
  "DesiredCapacity": 3,
  "TargetGroupARNs": ["arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/iphone-store-tg/123456789012"],
  "VPCZoneIdentifier": "subnet-12345678,subnet-87654321,subnet-abcdef12",
  "HealthCheckType": "ELB",
  "HealthCheckGracePeriodSeconds": 300,
  "LaunchTemplate": {
    "LaunchTemplateSpecification": {
      "LaunchTemplateId": "lt-12345678901234567",
      "Version": "$Latest"
    }
  },
  "ScalingPolicies": [
    {
      "PolicyName": "TargetTrackingPolicy",
      "PolicyType": "TargetTrackingScaling",
      "TargetTrackingConfiguration": {
        "PredefinedMetricSpecification": {
          "PredefinedMetricType": "ASGAverageCPUUtilization"
        },
        "TargetValue": 70.0,
        "DisableScaleIn": false
      }
    }
  ]
}
```

## Pros & Cons

### Pros
- **Familiar technology stack**: Node.js/Express is widely used
- **Simpler debugging**: Single codebase, easier to trace issues
- **Faster development**: No microservices complexity
- **Lower operational overhead**: No Kubernetes or service mesh
- **Predictable performance**: Monolithic performance is well understood
- **Easier testing**: Integration testing is simpler
- **Lower initial cost**: Less infrastructure complexity

### Cons
- **Limited scaling**: Can only scale the entire application
- **Single point of failure**: Bug in one module can crash entire app
- **Technology lock-in**: Harder to introduce new technologies
- **Deployment complexity**: Deploy entire app for small changes
- **Team coordination**: Large teams can conflict on same codebase
- **Resource waste**: Scaling entire app even if only one module is under load

## Best Use Case

- **Small to medium teams** (3-10 developers)
- **Familiarity with Node.js/Express** stack
- **Moderate traffic patterns** (not sustained 10K+ concurrent)
- **Limited DevOps resources** (1-2 engineers)
- **Faster time to market** (3-5 weeks)
- **Predictable scaling requirements**

## Team Requirements

- **Full-stack Node.js developers**: 2-4 developers
- **DevOps engineer**: 1-2 people familiar with AWS
- **Total team size**: 4-6 people

## Estimated Costs

**Development Phase (1-2 months):**
- Development EC2 instances: $100-300/month
- Development RDS (PostgreSQL): $50-150/month
- Development ElastiCache (Redis): $20-100/month
- Development RabbitMQ: Self-hosted on EC2 ($50-100)
- S3 for static assets: $0-50/month
- Total Development: $220-700/month

**Production Launch:**
- Application Load Balancer (ALB): $20-40/month
- EC2 instances (3-5 instances): $300-750/month
- Production RDS (PostgreSQL Multi-AZ): $200-500/month
- ElastiCache (Redis cluster): $100-300/month
- RabbitMQ (clustered): $100-200/month
- CloudFront CDN: $50-200/month
- S3 storage: $20-50/month
- CloudWatch monitoring: $50-100/month
- Route 53 DNS: $0.50-1/month

**Total Production Launch: $840-2141/month**

**High Volume (10K+ concurrent):**
- Application Load Balancer: $40-80/month
- EC2 instances (15-20 instances): $1500-3000/month
- Production RDS with read replicas: $500-1500/month
- ElastiCache (Redis cluster mode): $300-800/month
- RabbitMQ (clustered): $300-600/month
- CloudFront CDN: $200-1000/month
- S3 storage: $50-200/month
- Enhanced monitoring: $100-300/month

**Total High Volume: $2990-7480/month**

## Scalability Plan

| Metric | Current Config | Scale to 100K Users | Scale to 1M Users |
|--------|----------------|---------------------|-------------------|
| **Application** | 3 instances | 8 instances | 20+ instances |
| **Database** | 1 primary + 1 replica | 1 primary + 3 replicas | 1 primary + 5 replicas |
| **Redis** | 1 cluster | 1 cluster (more memory) | 2 clusters (sharded) |
| **RabbitMQ** | 1 instance | 3 nodes (clustered) | 5 nodes (clustered) |
| **Load Balancer** | 1 ALB | 1 ALB (add NLB) | 1 ALB + 1 NLB |

## Migration Path to Microservices

If the application needs to scale beyond what the monolithic architecture can support, you can gradually migrate to microservices:

1. **Identify boundaries**: Extract inventory and order services first
2. **Strangler pattern**: Gradually replace monolith with services
3. **API gateway**: Introduce gateway to route requests
4. **Event-driven**: Introduce Kafka for async processing
5. **Database per service**: Split databases as services are extracted

Typical migration timeline: 6-12 months
