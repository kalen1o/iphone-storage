#!/bin/bash

set -euo pipefail

# Usage: ./infrastructure/kafka/topics.sh
KAFKA_BROKER="${KAFKA_BROKER:-kafka:9092}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-online-storage-kafka}"

create_topic() {
  local topic="$1"
  echo "  - ${topic}"
  docker exec -i "${KAFKA_CONTAINER}" kafka-topics --create \
    --if-not-exists \
    --bootstrap-server "${KAFKA_BROKER}" \
    --topic "${topic}" \
    --partitions 3 \
    --replication-factor 1 \
    --config retention.ms=604800000 >/dev/null
}

echo "Creating Kafka topics..."

echo "Order topics:"
create_topic "orders.created"
create_topic "orders.updated"
create_topic "orders.paid"
create_topic "orders.cancelled"
create_topic "orders.shipped"
create_topic "orders.payment_required"

echo "Payment topics:"
create_topic "payments.initiated"
create_topic "payments.succeeded"
create_topic "payments.failed"
create_topic "payments.webhook_received"

echo "Inventory topics:"
create_topic "inventory.reserved"
create_topic "inventory.released"
create_topic "inventory.out_of_stock"
create_topic "inventory.adjusted"

echo "DLQ topic:"
create_topic "events.dlq"

echo ""
echo "All topics created. Listing topics:"
docker exec -i "${KAFKA_CONTAINER}" kafka-topics --list --bootstrap-server "${KAFKA_BROKER}"

