# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN corepack enable && \
    pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dependencies for runtime
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    pnpm install --prod --frozen-lockfile

# Copy build
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["pnpm", "start"]
