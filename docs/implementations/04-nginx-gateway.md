# NGINX Gateway Configuration

This guide sets up the NGINX API gateway that acts as the central entry point for all HTTP traffic, handling TLS termination, routing, rate limiting, and basic security headers.

## Step 1: NGINX Directory Structure

Create the NGINX gateway service directory structure:

```bash
mkdir -p services/nginx-gateway/conf.d
mkdir -p infrastructure/nginx/certs
```

## Step 2: Main NGINX Configuration

Create the main NGINX configuration file.

### Create `services/nginx-gateway/nginx.conf`:

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging format with correlation IDs
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time" '
                    'cid=$http_x_correlation_id';

    access_log /var/log/nginx/access.log main;

    # Performance optimizations
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;

    # Rate limiting zones
    # Limit general requests per IP
    limit_req_zone $binary_remote_addr zone=general_limit:10m rate=60r/m;

    # Limit API requests per IP
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=120r/m;

    # Limit connection burst
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # Upstream definitions
    upstream core_api {
        least_conn;
        server core-api:8080 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # Include site configurations
    include /etc/nginx/conf.d/*.conf;

    # Health check endpoint
    server {
        listen 8080;
        server_name _;
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

## Step 3: HTTP to HTTPS Redirect

Create the configuration for redirecting HTTP to HTTPS.

### Create `services/nginx-gateway/conf.d/00-http-redirect.conf`:

```nginx
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Allow Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```

## Step 4: Main HTTPS Configuration

Create the main HTTPS server configuration.

### Create `services/nginx-gateway/conf.d/01-https-server.conf`:

```nginx
# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # SSL certificates
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/certs/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self';" always;

    # Add correlation ID if not present
    add_header X-Correlation-ID $request_id always;

    # Rate limiting
    limit_req zone=general_limit burst=10 nodelay;
    limit_conn conn_limit 10;

    # Client body size limit
    client_max_body_size 10M;

    # Timeouts
    client_body_timeout 12;
    client_header_timeout 12;
    keepalive_timeout 65;
    send_timeout 10;

    # Include additional configurations
    include /etc/nginx/conf.d/api/*.conf;
    include /etc/nginx/conf.d/frontend/*.conf;
}
```

## Step 5: API Route Configuration

Create API-specific routing configuration.

### Create `services/nginx-gateway/conf.d/api/api.conf`:

```nginx
# API routes - proxy to core-api

# Health check
location /api/health {
    proxy_pass http://core_api/health;
    access_log off;
}

# Version endpoint
location /api/version {
    proxy_pass http://core_api/version;
    access_log off;
}

# Auth endpoints
location /api/auth {
    # Rate limit auth endpoints
    limit_req zone=api_limit burst=5 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    # Proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;

    # Timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;

    # Buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;
}

# User endpoints
location /api/users {
    # Rate limit user endpoints
    limit_req zone=api_limit burst=10 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Product endpoints
location /api/products {
    # Higher rate limit for public product endpoints
    limit_req zone=api_limit burst=20 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;

    # Cache product list
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_bypass $http_cache_control;
    add_header X-Cache-Status $upstream_cache_status;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Cart endpoints
location /api/cart {
    # Rate limit cart endpoints
    limit_req zone=api_limit burst=10 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;
    proxy_set_header Cookie $http_cookie;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Order endpoints
location /api/orders {
    # Rate limit order endpoints
    limit_req zone=api_limit burst=5 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;
    proxy_set_header Cookie $http_cookie;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Payment endpoints
location /api/payments {
    # Strict rate limit for payment endpoints
    limit_req zone=api_limit burst=3 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;
    proxy_set_header Cookie $http_cookie;

    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}

# Webhook endpoints (for payment providers)
location /api/webhooks {
    # No rate limiting for webhooks
    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;

    # Allow POST only for webhooks
    limit_except POST {
        deny all;
    }

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Admin endpoints
location /api/admin {
    # Strict rate limit for admin endpoints
    limit_req zone=api_limit burst=5 nodelay;

    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;
    proxy_set_header Cookie $http_cookie;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Catch-all for API
location /api {
    proxy_pass http://core_api;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Correlation-ID $request_id;

    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}
```

## Step 6: Frontend Configuration

Create configuration for serving the Remix frontend.

### Create `services/nginx-gateway/conf.d/frontend/frontend.conf`:

```nginx
# Remix Frontend
location / {
    # Try serving static files first
    try_files $uri $uri/ @remix;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Cache build assets
    location /build/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}

# Proxy to Remix for all non-static requests
location @remix {
    proxy_pass http://frontend:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;

    # Disable buffering for Server-Sent Events
    proxy_buffering off;

    # Timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

## Step 7: Cache Configuration

Add caching configuration for API responses.

### Add to `services/nginx-gateway/nginx.conf` (in the http block):

```nginx
# Proxy cache configuration
proxy_cache_path /var/cache/nginx/api_cache levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m use_temp_path=off;
proxy_cache_path /var/cache/nginx/static_cache levels=1:2 keys_zone=static_cache:10m max_size=1g inactive=7d use_temp_path=off;

# Cache key configuration
proxy_cache_key "$scheme$request_method$host$request_uri$is_args$args";
```

## Step 8: Dockerfile for NGINX

Create the Dockerfile for the NGINX gateway service.

### Create `services/nginx-gateway/Dockerfile`:

```dockerfile
# Multi-stage build for NGINX with custom modules if needed
FROM nginx:1.25-alpine AS builder

# Create necessary directories
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/www/certbot

# Install additional tools
RUN apk add --no-cache curl

# Production stage
FROM nginx:1.25-alpine

# Copy custom configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d /etc/nginx/conf.d

# Create necessary directories
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/www/certbot \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx

# Expose ports
EXPOSE 80 443 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
```

## Step 9: Self-Signed Certificates (Development)

For local development, create self-signed SSL certificates.

### Create `infrastructure/nginx/generate-dev-certs.sh`:

```bash
#!/bin/bash

# Generate self-signed SSL certificates for development
# Usage: ./infrastructure/nginx/generate-dev-certs.sh

set -e

CERTS_DIR="infrastructure/nginx/certs"
DAYS_VALID=365
DOMAIN="localhost"

# Create directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate private key
openssl genrsa -out "$CERTS_DIR/privkey.pem" 2048

# Generate certificate signing request
openssl req -new -key "$CERTS_DIR/privkey.pem" \
  -out "$CERTS_DIR/cert.csr" \
  -subj "/C=US/ST=State/L=City/O=Organization/OU=Development/CN=$DOMAIN"

# Generate self-signed certificate
openssl x509 -req -days $DAYS_VALID -in "$CERTS_DIR/cert.csr" \
  -signkey "$CERTS_DIR/privkey.pem" \
  -out "$CERTS_DIR/fullchain.pem"

# Create chain.pem (same as fullchain.pem for self-signed)
cp "$CERTS_DIR/fullchain.pem" "$CERTS_DIR/chain.pem"

# Cleanup CSR
rm "$CERTS_DIR/cert.csr"

echo "SSL certificates generated successfully in $CERTS_DIR"
echo "Certificate: $CERTS_DIR/fullchain.pem"
echo "Private key: $CERTS_DIR/privkey.pem"
echo "Chain: $CERTS_DIR/chain.pem"
echo ""
echo "WARNING: These are self-signed certificates for development only!"
echo "Do not use them in production."
```

Make the script executable:

```bash
chmod +x infrastructure/nginx/generate-dev-certs.sh
```

Generate development certificates:

```bash
./infrastructure/nginx/generate-dev-certs.sh
```

## Step 10: Production Certificates (Let's Encrypt)

For production, use Let's Encrypt with Certbot.

### Create `infrastructure/nginx/setup-letsencrypt.sh`:

```bash
#!/bin/bash

# Setup Let's Encrypt certificates with Certbot
# Usage: ./infrastructure/nginx/setup-letsencrypt.sh <your-domain>

set -e

DOMAIN="${1:-example.com}"
EMAIL="${2:-admin@example.com}"
CERTBOT_DIR="infrastructure/nginx/certbot"

# Create certbot directory
mkdir -p "$CERTBOT_DIR"

# Run certbot to obtain certificate
docker run --rm \
  -v "$CERTBOT_DIR:/etc/letsencrypt" \
  -v "$PWD/infrastructure/nginx/certs:/etc/nginx/certs" \
  -p 80:80 \
  certbot/certbot:latest \
  certonly --standalone \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --keep-until-expiring

# Create symlinks for NGINX
ln -sf "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" "infrastructure/nginx/certs/fullchain.pem"
ln -sf "$CERTBOT_DIR/live/$DOMAIN/privkey.pem" "infrastructure/nginx/certs/privkey.pem"
ln -sf "$CERTBOT_DIR/live/$DOMAIN/chain.pem" "infrastructure/nginx/certs/chain.pem"

echo "Certificates obtained successfully for $DOMAIN"
echo "Set up a cron job or systemd timer to renew certificates before expiry."
```

### Create `infrastructure/nginx/renew-certs.sh`:

```bash
#!/bin/bash

# Renew Let's Encrypt certificates
# Usage: ./infrastructure/nginx/renew-certs.sh

set -e

CERTBOT_DIR="infrastructure/nginx/certbot"

# Run certbot to renew certificates
docker run --rm \
  -v "$CERTBOT_DIR:/etc/letsencrypt" \
  -v "$PWD/infrastructure/nginx/certs:/etc/nginx/certs" \
  certbot/certbot:latest \
  renew

# Reload NGINX if certificates were renewed
docker compose exec nginx-gateway nginx -s reload

echo "Certificate renewal completed"
```

Make scripts executable:

```bash
chmod +x infrastructure/nginx/setup-letsencrypt.sh
chmod +x infrastructure/nginx/renew-certs.sh
```

## Step 11: Update Makefile

Add NGINX-related targets to the Makefile:

```makefile
# NGINX targets
nginx-config-test:
	docker compose exec nginx-gateway nginx -t

nginx-reload:
	docker compose exec nginx-gateway nginx -s reload

nginx-logs:
	docker compose logs -f nginx-gateway

nginx-access-logs:
	docker compose exec nginx-gateway tail -f /var/log/nginx/access.log

nginx-error-logs:
	docker compose exec nginx-gateway tail -f /var/log/nginx/error.log

# SSL certificates (development)
generate-dev-certs:
	./infrastructure/nginx/generate-dev-certs.sh

# SSL certificates (production)
setup-letsencrypt:
	@read -p "Enter your domain: " domain; \
	read -p "Enter your email: " email; \
	./infrastructure/nginx/setup-letsencrypt.sh $$domain $$email

renew-certs:
	./infrastructure/nginx/renew-certs.sh

# Reload services after config changes
reload-services:
	$(MAKE) nginx-config-test
	$(MAKE) nginx-reload
```

## Step 12: Test NGINX Configuration

Test the NGINX configuration:

```bash
# Start services
make up

# Wait for services to be ready
sleep 10

# Test NGINX health check
curl http://localhost:8080/health

# Test HTTPS (with self-signed certs)
curl -k https://localhost/health

# Test API routing
curl -k https://localhost/api/health

# Test frontend routing
curl -k https://localhost/

# View NGINX logs
make nginx-logs

# Test configuration
make nginx-config-test
```

## Step 13: Verify NGINX Setup

Verify the NGINX gateway is working correctly:

```bash
# Check NGINX status
docker compose ps nginx-gateway

# View NGINX configuration
docker compose exec nginx-gateway nginx -T

# Check SSL certificates
docker compose exec nginx-gateway ls -la /etc/nginx/certs/

# Check upstream connections
docker compose exec nginx-gateway cat /etc/nginx/conf.d/*.conf

# Test connectivity to upstream services
docker compose exec nginx-gateway wget -O- http://core-api:8080/health
```

## Next Steps

With the NGINX gateway configured, continue to the next implementation guide: [05-core-api.md](./05-core-api.md)

## Troubleshooting

### 502 Bad Gateway
- Check upstream service is running: `docker compose ps core-api`
- Verify upstream DNS resolution: `docker compose exec nginx-gateway ping core-api`
- Check NGINX error logs: `make nginx-error-logs`

### SSL certificate errors
- Verify certificates exist: `ls -la infrastructure/nginx/certs/`
- For development, regenerate certs: `make generate-dev-certs`
- For production, run setup-letsencrypt script

### Rate limiting issues
- Adjust rate limits in `services/nginx-gateway/nginx.conf`
- Monitor connection limits in logs
- Adjust burst values for your traffic patterns

### Configuration reload fails
- Test configuration first: `make nginx-config-test`
- Check syntax errors in config files
- Review error logs for specific issues

### High response times
- Check upstream service performance
- Review NGINX access logs for slow requests
- Adjust proxy timeout values
- Consider enabling more aggressive caching
