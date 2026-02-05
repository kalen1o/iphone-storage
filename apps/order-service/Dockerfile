FROM golang:1.21-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
COPY shared ./shared
COPY apps/order-service ./apps/order-service

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/order-service ./apps/order-service/cmd/order

FROM alpine:3.18

WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /out/order-service /app/order-service

CMD ["/app/order-service"]
