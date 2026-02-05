FROM golang:1.24-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
COPY shared ./shared
COPY apps/payment-service ./apps/payment-service

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/payment-service ./apps/payment-service/cmd/payment

FROM alpine:3.18

WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /out/payment-service /app/payment-service

CMD ["/app/payment-service"]
