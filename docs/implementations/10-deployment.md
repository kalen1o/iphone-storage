# Deployment Guide

This guide covers deploying your online storage system using the Simplified Service-Oriented Stack to production.

## Prerequisites

Before deploying, ensure you have:

- All services built and tested locally
- Production environment variables configured
- SSL certificates configured (Let's Encrypt or custom)
- Domain name configured and pointing to your server
- Cloud provider account (AWS, GCP, DigitalOcean, or similar)
- Monitoring and logging solution ready (optional but recommended)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Server(s)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐          │
│  │  NGINX       │         │   Docker     │          │
│  │  Gateway     │────────▶│  Compose    │          │
│  │  (443, 80)   │         │   Orchestration    │          │
│  └──────────────┘         └──────────────┘          │
│                                        │                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ┌────────────┐  ┌────────────┐              │   │
│  │  │  PostgreSQL│  │   Kafka    │              │   │
│  │  │  Database  │  │   Cluster  │              │   │
│  │  └────────────┘  └────────────┘              │   │
│  │                                               │   │
│  │  ┌─────────────┐ ┌─────────────┐          │   │
│  │  │Core API    │ │Order        │          │   │
│  │  │Service     │ │Service      │          │   │
│  │  └─────────────┘ └─────────────┘          │   │
│  │                                               │   │
│  │  ┌─────────────┐ ┌─────────────┐          │   │
│  │  │Payment      │ │Inventory    │          │   │
│  │  │Service     │ │Service      │          │   │
│  │  └─────────────┘ └─────────────┘          │   │
│  │                                               │   │
│  │  ┌─────────────┐                         │   │
│  │  │Remix        │                         │   │
│  │  │Frontend     │                         │   │
│  │  └─────────────┘                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Prepare Production Environment

### 1.1 Server Requirements

| Resource | Minimum | Recommended |
|-----------|----------|-------------|
| **CPU** | 2 cores | 4 cores+ |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 40 GB SSD | 100 GB+ SSD |
| **Network** | 100 Mbps | 1 Gbps |

### 1.2 Install Dependencies

SSH into your production server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install NGINX (for SSL)
sudo apt install -y nginx certbot python3-certbot-nginx

# Verify installations
docker --version
docker-compose --version
nginx -v
```

### 1.3 Clone Repository

```bash
# Clone repository
git clone https://github.com/yourusername/online-storage.git
cd online-storage

# Create production branch
git checkout -b production

# Create .env.production file
cp .env.example .env
```

## Step 2: Configure Production Environment

### 2.1 Create `.env.production`

Create a secure `.env.production` file with production values:

```bash
# Database Configuration
POSTGRES_USER=your_secure_db_user
POSTGRES_PASSWORD=your_secure_db_password_very_long_and_random
POSTGRES_DB=online_storage_prod

# Kafka Configuration
KAFKA_BROKERS=kafka:9092

# Service Configuration
LOG_LEVEL=info
ENVIRONMENT=production

# Payment Provider (Stripe)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key

# Frontend Configuration
REMIX_PUBLIC_API_URL=https://api.yourdomain.com/api

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# JWT Configuration
JWT_SECRET=your_jwt_secret_very_long_and_random_at_least_32_characters
JWT_EXPIRY=24h

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=120
```

### 2.2 Generate Secure Passwords

Generate strong random passwords:

```bash
# Generate database password
openssl rand -base64 32

# Generate JWT secret
openssl rand -base64 64

# Generate webhook secret
openssl rand -hex 32
```

## Step 3: Configure SSL Certificates

### 3.1 Setup Let's Encrypt

Obtain SSL certificates for your domain:

```bash
# Stop NGINX if running
sudo systemctl stop nginx

# Obtain certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email admin@yourdomain.com \
  --agree-tos \
  --non-interactive

# Create certificates directory
mkdir -p infrastructure/nginx/certs

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem infrastructure/nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem infrastructure/nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/chain.pem infrastructure/nginx/certs/

# Set proper permissions
sudo chmod 644 infrastructure/nginx/certs/*.pem
```

### 3.2 Setup Auto-Renewal

Configure automatic certificate renewal:

```bash
# Create renewal script
cat << 'EOF' | sudo tee /usr/local/bin/renew-certs.sh
#!/bin/bash
sudo certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /path/to/online-storage/infrastructure/nginx/certs/ && cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /path/to/online-storage/infrastructure/nginx/certs/"
docker compose exec -w /app nginx-gateway nginx -s reload
EOF

# Make executable
sudo chmod +x /usr/local/bin/renew-certs.sh

# Add to crontab (renew weekly)
(crontab -l 2>/dev/null; echo "0 3 * * 0 /usr/local/bin/renew-certs.sh") | crontab -
```

## Step 4: Deploy with Docker Compose

### 4.1 Build and Start Services

```bash
# Load production environment
export $(cat .env.production | xargs)

# Build all services
docker-compose -f docker-compose.yml --env-file .env.production build

# Start all services
docker-compose -f docker-compose.yml --env-file .env.production up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4.2 Verify Services

```bash
# Check PostgreSQL
docker-compose exec postgres pg_isready -U admin

# Check Kafka
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Check Core API
curl http://localhost:8080/health

# Check Frontend
curl http://localhost:3000

# Check NGINX
curl http://localhost/health
```

## Step 5: Configure NGINX for Production

### 5.1 Update NGINX Configuration

Update `services/nginx-gateway/nginx.conf` for production:

```nginx
# Update upstream servers for production
upstream core_api {
    least_conn;
    server core-api:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# Add production-specific settings
http {
    # Increase client body size for file uploads
    client_max_body_size 50M;
    
    # Security headers for production
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # HSTS for HTTPS only
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Remove server tokens
    server_tokens off;
    
    # ... rest of configuration
}
```

### 5.2 Update Domain in NGINX

Update `services/nginx-gateway/conf.d/01-https-server.conf`:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    # Update with your domain
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL certificates
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    
    # ... rest of configuration
}
```

## Step 6: Database Setup

### 6.1 Run Migrations

```bash
# Run database migrations
docker-compose exec -T postgres psql -U admin -d online_storage_prod < shared/db/migrations/001_initial_schema.sql
```

### 6.2 Seed Initial Data (Optional)

```bash
# Run seed data
docker-compose exec -T postgres psql -U admin -d online_storage_prod < shared/db/seeds/001_sample_data.sql
```

### 6.3 Configure Backups

Setup automated database backups:

```bash
# Create backup script
cat << 'EOF' > scripts/prod-backup.sh
#!/bin/bash

BACKUP_DIR="/backups/postgres"
DATE=$(date +"%Y%m%d_%H%M%S")
CONTAINER="online-storage-postgres"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker exec $CONTAINER pg_dump -U admin online_storage_prod > $BACKUP_DIR/backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/backup_$DATE.sql

# Delete backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
EOF

chmod +x scripts/prod-backup.sh
```

Add to crontab (daily backups at 2 AM):

```bash
(crontab -l 2>/dev/null; echo "0 2 * * * /path/to/online-storage/scripts/prod-backup.sh") | crontab -
```

## Step 7: Configure Payment Provider

### 7.1 Stripe Configuration

1. **Login to Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Select your account

2. **Configure Webhooks**
   - Navigate to Developers → Webhooks
   - Click "Add endpoint"
   - Enter URL: `https://yourdomain.com/api/webhooks/stripe`
   - Select events:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
   - Copy the webhook signing secret

3. **Update Environment Variables**
   - Update `STRIPE_SECRET_KEY` with your live secret key
   - Update `STRIPE_WEBHOOK_SECRET` with webhook secret
   - Update `STRIPE_PUBLISHABLE_KEY` with publishable key

4. **Restart Services**
   ```bash
   docker-compose restart payment-service
   docker-compose restart core-api
   ```

### 7.2 Test Payment Flow

Test payment flow with Stripe test mode first:

```bash
# Use test keys
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key

# Run a test order through the application
```

## Step 8: Monitoring and Logging

### 8.1 Configure Logs

Set up centralized logging:

```bash
# Create logs directory
mkdir -p /var/log/online-storage

# Update docker-compose.yml to mount logs
volumes:
  - /var/log/online-storage:/var/log

# View logs
docker-compose logs -f > /var/log/online-storage/docker.log
```

### 8.2 Health Monitoring

Add health check endpoints and configure monitoring:

```bash
# Create health check script
cat << 'EOF' > scripts/health-check.sh
#!/bin/bash

SERVICES=("core-api" "order-service" "payment-service" "inventory-service" "frontend" "nginx-gateway")
HEALTHY=0

for service in "${SERVICES[@]}"; do
  # Check if container is running
  if docker ps | grep -q $service; then
    # Check service health endpoint
    if curl -sf http://localhost:${service}_port/health > /dev/null; then
      echo "$service: OK"
      HEALTHY=$((HEALTHY + 1))
    else
      echo "$service: UNHEALTHY"
    fi
  else
    echo "$service: DOWN"
  fi
done

echo "Services healthy: $HEALTHY/${#SERVICES[@]}"

# Send alert if services are down
if [ $HEALTHY -lt ${#SERVICES[@]} ]; then
  # Send alert (configure your notification method)
  echo "ALERT: Some services are down!" | mail -s "Service Alert" admin@yourdomain.com
fi
EOF

chmod +x scripts/health-check.sh
```

Add to crontab (every 5 minutes):

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * /path/to/online-storage/scripts/health-check.sh") | crontab -
```

## Step 9: Security Hardening

### 9.1 Firewall Configuration

Configure firewall (UFW):

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### 9.2 SSH Hardening

Configure SSH for security:

```bash
# Edit SSH configuration
sudo nano /etc/ssh/sshd_config

# Update settings:
# Port 2222 (change from default 22)
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart sshd
```

### 9.3 Update Environment Variables

Ensure production environment variables are secure:

```bash
# Restrict file permissions
chmod 600 .env.production

# Never commit .env.production to git
echo ".env.production" >> .gitignore

# Remove from git history if accidentally committed
git rm --cached .env.production
git commit -m "Remove .env.production from git"
```

## Step 10: Performance Optimization

### 10.1 PostgreSQL Tuning

Optimize PostgreSQL configuration:

```bash
# Create custom config
cat << 'EOF' > infrastructure/postgresql/postgresql.conf
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 16MB

# Connection settings
max_connections = 100

# Query tuning
random_page_cost = 1.1
effective_io_concurrency = 200

# WAL settings
wal_buffers = 16MB
checkpoint_completion_target = 0.9
max_wal_size = 1GB
EOF
```

### 10.2 NGINX Optimization

Optimize NGINX for production:

```nginx
# Add to nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Buffering
    client_body_buffer_size 128K;
    client_max_body_size 50m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;
    output_buffers 1 32k;
    postpone_output 256;
    
    # Timeouts
    client_body_timeout 12s;
    client_header_timeout 12s;
    keepalive_timeout 65s;
    keepalive_requests 100;
    
    # Gzip
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 1100;
    gzip_buffers 16 8k;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/rss+xml
        application/atom+xml
        image/svg+xml;
    
    # Caching
    proxy_cache_path /var/cache/nginx/api_cache levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m use_temp_path=off;
    proxy_cache_background_update on;
}
```

### 10.3 Enable Redis Caching

Add Redis caching layer:

```bash
# Update .env.production to include Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Update docker-compose.yml to scale Redis
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  networks:
    - backend
  restart: unless-stopped
```

## Step 11: CI/CD Pipeline

### 11.1 GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push images
        run: |
          docker-compose build
          docker-compose push

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /path/to/online-storage
            git pull origin main
            docker-compose pull
            docker-compose up -d
            docker system prune -f
```

### 11.2 Add GitHub Secrets

Add required secrets to GitHub repository:
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `SERVER_HOST`
- `SERVER_USERNAME`
- `SSH_PRIVATE_KEY`

## Step 12: Rollback Plan

### 12.1 Database Rollback

```bash
# Restore from backup
gunzip < /backups/postgres/backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker-compose exec -T postgres psql -U admin -d online_storage_prod
```

### 12.2 Service Rollback

```bash
# Rollback to previous Docker images
docker-compose down
docker-compose up -d --no-deps --build

# Or rollback to specific commit
git checkout <commit-hash>
docker-compose up -d
```

## Step 13: Testing Production

### 13.1 Smoke Tests

Run smoke tests after deployment:

```bash
# Create test script
cat << 'EOF' > scripts/smoke-test.sh
#!/bin/bash

BASE_URL="https://yourdomain.com"

echo "Running smoke tests..."

# Test health endpoints
echo "Testing health endpoints..."
curl -sf $BASE_URL/health || echo "Health check failed!"

# Test frontend
echo "Testing frontend..."
curl -sf $BASE_URL/ || echo "Frontend test failed!"

# Test API
echo "Testing API..."
curl -sf $BASE_URL/api/health || echo "API health check failed!"

# Test products endpoint
echo "Testing products endpoint..."
curl -sf $BASE_URL/api/products || echo "Products test failed!"

echo "Smoke tests completed!"
EOF

chmod +x scripts/smoke-test.sh
```

### 13.2 Load Testing

Perform load testing:

```bash
# Install k6
curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/

# Create load test script
cat << 'EOF' > load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 100,
  duration: '5m',
};

export default function () {
  let res = http.get('https://yourdomain.com/api/products');
  check(res, {
    'status was 200': (r) => r.status === 200,
  });
  sleep(1);
};
EOF

# Run load test
k6 run load-test.js
```

## Step 14: Documentation

### 14.1 Update README

Update repository README with deployment information:

```markdown
# Online Storage System

## Deployment

### Prerequisites
- Docker 24+
- Docker Compose 2.20+
- Node.js 20+
- PostgreSQL 16+
- Apache Kafka

### Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/online-storage.git
cd online-storage

# Configure environment
cp .env.example .env.production
# Edit .env.production with your values

# Deploy
docker-compose -f docker-compose.yml --env-file .env.production up -d
```

### Monitoring
- Health check: https://yourdomain.com/health
- API health: https://yourdomain.com/api/health
- Grafana: https://grafana.yourdomain.com
```

## Step 15: Post-Deployment Checklist

After deployment, verify:

- [ ] All services are running and healthy
- [ ] SSL certificates are valid and not expiring
- [ ] Database connections are working
- [ ] Kafka topics are created
- [ ] Payment provider webhooks are configured
- [ ] Backups are scheduled and running
- [ ] Monitoring and alerts are configured
- [ ] Firewall rules are configured
- [ ] SSH access is secured
- [ ] Application logs are being collected
- [ ] Performance metrics are being tracked
- [ ] DNS records are pointing correctly
- [ ] Load balancer is configured (if applicable)
- [ ] CI/CD pipeline is tested
- [ ] Rollback procedure is documented

## Troubleshooting

### Services won't start
- Check resource usage: `docker stats`
- Review logs: `docker-compose logs`
- Verify environment variables: `docker-compose config`
- Check port conflicts: `netstat -tlnp`

### Database connection issues
- Verify PostgreSQL is running: `docker-compose ps postgres`
- Check credentials in `.env.production`
- Review database logs: `docker-compose logs postgres`

### SSL certificate errors
- Verify certificate paths in NGINX config
- Check certificate expiration: `openssl x509 -enddate -noout -in /path/to/cert.pem`
- Renew certificates: `sudo certbot renew`

### Performance issues
- Check resource limits: `docker info`
- Review database performance: `docker-compose exec postgres pg_stat_statements`
- Analyze NGINX access logs for slow requests

### Kafka connection issues
- Verify Kafka broker addresses
- Check network connectivity between containers
- Review Kafka logs: `docker-compose logs kafka`

## Conclusion

You've successfully deployed your online storage system using the Simplified Service-Oriented Stack. Your system is now production-ready with:

- NGINX API gateway with SSL/TLS
- PostgreSQL database with backups
- Apache Kafka for event-driven communication
- Four microservices (Core API, Order, Payment, Inventory)
- Remix frontend with modern UI
- Monitoring, logging, and security hardening

For additional support and updates, refer to the project documentation and monitoring dashboards.
