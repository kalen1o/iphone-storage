# Approach 1: Cloud-Native Serverless Stack

## Overview

Serverless architecture designed for rapid deployment and automatic scaling, ideal for product launches with unpredictable traffic spikes.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 15 + React 18 + TypeScript | Server-side rendering for SEO, ISR for performance |
| **Backend API** | Vercel Edge Functions + Node.js | Global edge deployment, auto-scaling |
| **Database** | PostgreSQL (Supabase) | Strong ACID compliance, row-level locking |
| **Cache** | Redis (Upstash) | Distributed caching, atomic operations |
| **Queue** | AWS SQS + Lambda | Serverless queue processing |
| **Load Balancing** | Vercel's Global Edge Network | Automatic intelligent routing |
| **CDN** | Vercel Edge Network / AWS CloudFront | Built-in, global distribution |
| **Payment** | Stripe | PCI-compliant, webhook-based |
| **Search** | Algolia | Fast product search, analytics |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CDN (CloudFront/Vercel)                       │
│                        Static Assets, Images, API Routes                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
           ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
           │   Edge Region   │   │   Edge Region   │   │   Edge Region   │
           │      (US-E)     │   │      (EU-W)     │   │      (AP-N)     │
           ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
           │   Next.js Edge  │   │   Next.js Edge  │   │   Next.js Edge  │
           │   Functions     │   │   Functions     │   │   Functions     │
           │  - Product API  │   │  - Product API  │   │  - Product API  │
           │  - Cart API     │   │  - Cart API     │   │  - Cart API     │
           └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                    │                     │                     │
                    └─────────────────────┼─────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
     ┌────────▼────────┐        ┌────────▼────────┐        ┌────────▼────────┐
     │   Redis Cache   │        │  PostgreSQL DB   │        │  Message Queue  │
     │   (Upstash)     │        │   (Supabase)     │        │   (AWS SQS)     │
     ├─────────────────┤        ├─────────────────┤        ├─────────────────┤
     │ - Rate Limit    │        │ - Products      │        │ - Order Events  │
     │ - Inventory TTL │        │ - Inventory     │        │ - Payment Webhooks│
     │ - Session Data  │        │ - Orders        │        │ - Analytics     │
     │ - Product Cache │        │ - Users         │        │                 │
     └─────────────────┘        └────────┬────────┘        └────────┬────────┘
                                         │                         │
                              ┌──────────┼──────────┐             │
                              │                     │             │
                    ┌─────────▼────────┐   ┌────────▼────────┐   │
                    │  Row-Level Lock  │   │  Index:        │   │
                    │  (SELECT...FOR   │   │  - product_id  │   │
                    │   UPDATE)        │   │  - inventory   │   │
                    └──────────────────┘   └─────────────────┘   │
                                                              │
                                        ┌─────────────────────┘
                                        │
                               ┌────────▼────────┐
                               │  Lambda Workers │
                               │  - Process Orders│
                               │  - Email Send   │
                               │  - Analytics    │
                               └─────────────────┘

                    External Services:
                    ┌────────────────────────────────────────┐
                    │   Stripe (Payment)                    │
                    │   Algolia (Search)                    │
                    │   SendGrid (Email)                    │
                    │   New Relic (Monitoring)              │
                    └────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Inventory Management (Preventing Overselling)

```typescript
// Transaction with pessimistic locking
async function purchaseProduct(userId: string, productId: string, quantity: number) {
  return await prisma.$transaction(async (tx) => {
    // Lock the inventory row for the duration of the transaction
    const inventory = await tx.inventory.findUnique({
      where: { productId },
      lock: {
        mode: 'pessimistic' // SELECT FOR UPDATE
      }
    });

    if (!inventory || inventory.available < quantity) {
      throw new Error('Insufficient inventory');
    }

    // Decrement inventory atomically
    const updatedInventory = await tx.inventory.update({
      where: { productId },
      data: {
        available: { decrement: quantity },
        reserved: { increment: quantity }
      }
    });

    // Create order
    const order = await tx.order.create({
      data: {
        userId,
        productId,
        quantity,
        status: 'pending_payment',
        totalPrice: quantity * inventory.price
      }
    });

    return { order, updatedInventory };
  });
}
```

**Redis Fallback for Extreme Spikes:**
```typescript
// Redis atomic decrement with Lua script
const inventoryScript = `
  local available = tonumber(redis.call("GET", KEYS[1]))
  if available < tonumber(ARGV[1]) then
    return 0
  end
  redis.call("DECRBY", KEYS[1], ARGV[1])
  redis.call("INCRBY", KEYS[2], ARGV[1])
  return 1
`;
```

### 2. Handling Traffic Spikes

**Multi-layer Protection:**
1. **Edge-level rate limiting**: 10 requests/second per IP
2. **Redis-based inventory queue**: First-come-first-served FIFO
3. **Circuit breakers**: Fail-fast when backend is overloaded
4. **Queue-based ordering**: Async order processing during spikes

```typescript
// Queue-based purchase flow
app.post('/api/purchase', async (req, res) => {
  const { productId, userId } = req.body;

  // Fast check using Redis cache (sub-millisecond)
  const available = await redis.get(`inventory:${productId}`);
  if (!available || parseInt(available) === 0) {
    return res.status(400).json({ error: 'Out of stock' });
  }

  // Reserve slot atomically
  const reserved = await reserveInventorySlot(productId, userId);
  if (!reserved) {
    return res.status(429).json({ error: 'High demand, try again' });
  }

  // Queue payment processing
  await sqs.sendMessage({
    QueueUrl: ORDER_PROCESSING_QUEUE,
    MessageBody: JSON.stringify({ userId, productId, reserveId: reserved })
  });

  return res.status(202).json({
    message: 'Order reserved, processing payment...',
    reserveId: reserved
  });
});
```

### 3. Static Asset Delivery Strategy

```
Assets Optimization Pipeline:
┌─────────────────────────────────────────────────────────────┐
│  Original Product Images                                     │
│  (Raw: 4000x3000px, 15MB each)                               │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Image Optimization (Sharp/ImageMagick)                       │
│  - Generate responsive images (WebP/AVIF)                    │
│  - Multiple sizes: 320w, 640w, 1024w, 1920w, 2560w          │
│  - Lazy loading placeholders (blur-up)                      │
│  - Format: WebP (primary), JPEG fallback                    │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Upload to CDN                                               │
│  - Versioned URLs (content hash)                             │
│  - Long cache headers (1 year)                               │
│  - Edge caching enabled                                      │
└─────────────────────────────────────────────────────────────┘
```

**Next.js Image Optimization:**
```typescript
<Image
  src="/iphone-17-pro-max-hero.jpg"
  alt="iPhone 17 Pro Max"
  width={2560}
  height={1920}
  priority // Above-the-fold images
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Tiny inline base64
/>
```

### 4. Payment Processing Reliability

```typescript
// Idempotent payment processing with retries
async function processOrderWithPayment(reserveId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const tx = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reserveId },
        include: { inventory: true }
      });

      // Skip if already processed
      if (reservation.status !== 'pending') {
        return reservation;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: reservation.totalPrice,
        currency: 'usd',
        idempotencyKey: reserveId, // Prevent duplicate charges
        metadata: { reserveId, productId: reservation.productId }
      });

      return paymentIntent;
    });
  }
}
```

## Scalability Plan

| Metric | Current Config | Scale to 100K Users | Scale to 1M Users |
|--------|----------------|---------------------|-------------------|
| **Frontend** | Edge Functions (auto-scaling) | Add Cloudflare Workers | Multi-region edge deployment |
| **Database** | 1 read replica | 3 read replicas | Read-only replicas + connection pooling |
| **Cache** | Single Redis cluster | 2 Redis shards | 4 shards + read replicas |
| **Queue** | SQS Standard | SQS with DLQ | SQS + Lambda provisioned concurrency |

## Pros & Cons

### Pros
- **Rapid deployment**: Launch in 2-4 weeks
- **Auto-scaling**: Handles any traffic spike automatically
- **Minimal operations**: No infrastructure to manage
- **Cost-effective**: Pay only for usage during development
- **Global CDN**: Built-in edge deployment
- **Built-in security**: DDoS protection, SSL termination

### Cons
- **Cold starts**: Lambda cold starts for infrequently used functions
- **Limited control**: Vendor lock-in, less customization options
- **Performance overhead**: Higher latency compared to dedicated servers
- **Debugging complexity**: Harder to debug distributed systems
- **Cost at scale**: Can become expensive at sustained high volume

## Best Use Case

- **Rapid product launches** with unpredictable traffic
- **Small teams** with limited DevOps resources
- **MVP validation** before scaling
- **Variable traffic patterns** with occasional spikes

## Estimated Costs

**Development Phase:**
- Vercel: $0-100 (free tier covers most)
- Supabase: $0-25 (free tier)
- Redis (Upstash): $0-20 (free tier)
- AWS Lambda + SQS: $0-50 (minimal usage)

**Total Development: $0-200/month**

**Production Launch:**
- Vercel Pro: $20-200 (depending on traffic)
- Supabase Pro: $25-100 (with read replicas)
- Redis (Upstash): $20-100 (cluster mode)
- AWS (Lambda + SQS): $100-500 (depending on traffic)
- Stripe: 2.9% + $0.30 per transaction

**Total Production Launch: $165-920/month + transaction fees**

**High Volume (100K+ DAU):**
- Vercel: $200-1000/month
- Supabase: $100-500/month
- Redis: $100-500/month
- AWS: $500-3000/month

**Total High Volume: $900-5000/month + transaction fees**
