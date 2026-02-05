# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
COPY shared ./shared
COPY apps/core-api ./apps/core-api

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/core-api ./apps/core-api/cmd/api

# Runtime stage
FROM alpine:3.18

WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /out/core-api /app/core-api

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/app/core-api"]
