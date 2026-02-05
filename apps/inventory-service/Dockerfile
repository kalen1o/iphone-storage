FROM golang:1.21-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git ca-certificates

COPY go.mod ./
COPY shared ./shared
COPY apps/inventory-service ./apps/inventory-service

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/inventory-service ./apps/inventory-service/cmd/inventory

FROM alpine:3.18

WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /out/inventory-service /app/inventory-service

CMD ["/app/inventory-service"]

