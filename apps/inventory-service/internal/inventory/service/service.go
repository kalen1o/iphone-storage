package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	redis "github.com/redis/go-redis/v9"

	inventoryrepo "github.com/kalen1o/iphone-storage/apps/inventory-service/internal/inventory/repo"
	"github.com/kalen1o/iphone-storage/shared/events"
	sharedkafka "github.com/kalen1o/iphone-storage/shared/kafka"
	"github.com/kalen1o/iphone-storage/shared/logging"
	sharedredis "github.com/kalen1o/iphone-storage/shared/redis"
)

type Service struct {
	repo     *inventoryrepo.Postgres
	log      *logging.Logger
	redis    *redis.Client
	producer *sharedkafka.Producer

	reservationTTL   time.Duration
	sweepInterval    time.Duration
	processedEventTTL time.Duration
}

func New(r *inventoryrepo.Postgres, redisClient *redis.Client, producer *sharedkafka.Producer, log *logging.Logger) *Service {
	return &Service{
		repo:              r,
		redis:             redisClient,
		producer:          producer,
		log:               log,
		reservationTTL:    envDuration("INVENTORY_RESERVATION_TTL", 10*time.Minute),
		sweepInterval:     envDuration("INVENTORY_RESERVATION_SWEEP_INTERVAL", 2*time.Second),
		processedEventTTL: envDuration("INVENTORY_PROCESSED_EVENT_TTL", 24*time.Hour),
	}
}

func envDuration(key string, def time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return def
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return def
	}
	return d
}

func (s *Service) Run(ctx context.Context, brokers []string, groupID string) error {
	s.log.Info("service running", map[string]any{
		"reservation_ttl":      s.reservationTTL.String(),
		"sweep_interval":       s.sweepInterval.String(),
		"processed_event_ttl":  s.processedEventTTL.String(),
	})

	errCh := make(chan error, 5)

	go func() { errCh <- s.consumeOrdersCreated(ctx, brokers, groupID) }()
	go func() { errCh <- s.consumeOrdersPaid(ctx, brokers, groupID) }()
	go func() { errCh <- s.consumeOrdersCancelled(ctx, brokers, groupID) }()
	go func() { errCh <- s.sweepExpiredReservations(ctx) }()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-errCh:
		return err
	}
}

func (s *Service) consumeOrdersCreated(ctx context.Context, brokers []string, groupID string) error {
	c := sharedkafka.NewConsumer(sharedkafka.ConsumerConfig{
		Brokers: brokers,
		GroupID: groupID,
		Topic:   events.TopicOrdersCreated,
	})
	defer func() { _ = c.Close() }()

	for {
		msg, err := c.Fetch(ctx)
		if err != nil {
			return err
		}

		var env events.Envelope[events.OrdersCreatedData]
		if err := events.Unmarshal(msg.Value, &env); err != nil {
			s.log.Error("failed to decode orders.created", map[string]any{
				"err": err.Error(),
			})
			_ = c.Commit(ctx, msg)
			continue
		}

		if !s.markEventProcessed(ctx, env.EventID) {
			_ = c.Commit(ctx, msg)
			continue
		}

		if err := s.handleOrdersCreated(ctx, env); err != nil {
			s.log.Error("failed to handle orders.created", map[string]any{
				"err":      err.Error(),
				"order_id": env.Data.OrderID,
			})
		}

		_ = c.Commit(ctx, msg)
	}
}

func (s *Service) consumeOrdersPaid(ctx context.Context, brokers []string, groupID string) error {
	c := sharedkafka.NewConsumer(sharedkafka.ConsumerConfig{
		Brokers: brokers,
		GroupID: groupID,
		Topic:   events.TopicOrdersPaid,
	})
	defer func() { _ = c.Close() }()

	for {
		msg, err := c.Fetch(ctx)
		if err != nil {
			return err
		}

		var env events.Envelope[events.OrdersPaidData]
		if err := events.Unmarshal(msg.Value, &env); err != nil {
			_ = c.Commit(ctx, msg)
			continue
		}
		if !s.markEventProcessed(ctx, env.EventID) {
			_ = c.Commit(ctx, msg)
			continue
		}

		orderID, err := uuid.Parse(env.Data.OrderID)
		if err == nil {
			if s.hasReservation(ctx, env.Data.OrderID) {
				_ = s.repo.Finalize(ctx, orderID)
			}
			s.cleanupReservation(ctx, env.Data.OrderID)
		}
		_ = c.Commit(ctx, msg)
	}
}

func (s *Service) consumeOrdersCancelled(ctx context.Context, brokers []string, groupID string) error {
	c := sharedkafka.NewConsumer(sharedkafka.ConsumerConfig{
		Brokers: brokers,
		GroupID: groupID,
		Topic:   events.TopicOrdersCancelled,
	})
	defer func() { _ = c.Close() }()

	for {
		msg, err := c.Fetch(ctx)
		if err != nil {
			return err
		}
		var env events.Envelope[events.OrdersCancelledData]
		if err := events.Unmarshal(msg.Value, &env); err != nil {
			_ = c.Commit(ctx, msg)
			continue
		}
		if !s.markEventProcessed(ctx, env.EventID) {
			_ = c.Commit(ctx, msg)
			continue
		}
		orderID, err := uuid.Parse(env.Data.OrderID)
		if err == nil {
			if s.hasReservation(ctx, env.Data.OrderID) {
				_ = s.repo.Release(ctx, orderID)
			}
			s.cleanupReservation(ctx, env.Data.OrderID)
		}
		_ = c.Commit(ctx, msg)
	}
}

func (s *Service) handleOrdersCreated(ctx context.Context, env events.Envelope[events.OrdersCreatedData]) error {
	if env.Data.OrderID == "" {
		return errors.New("missing order_id")
	}

	orderID, err := uuid.Parse(env.Data.OrderID)
	if err != nil {
		return err
	}

	items := make([]inventoryrepo.OrderItem, 0, len(env.Data.Items))
	for _, it := range env.Data.Items {
		pid, err := uuid.Parse(it.ProductID)
		if err != nil {
			return err
		}
		items = append(items, inventoryrepo.OrderItem{ProductID: pid, Quantity: it.Quantity})
	}

	if ok, err := s.tryCreateReservation(ctx, env.Data.OrderID); err != nil {
		return err
	} else if !ok {
		// reservation already exists => assume already processed
		return nil
	}

	if err := s.repo.Reserve(ctx, orderID, items); err != nil {
		s.cleanupReservation(ctx, env.Data.OrderID)
		if errors.Is(err, inventoryrepo.ErrOutOfStock) {
			_, _ = s.repo.UpdateOrderStatusIf(ctx, orderID, "payment_required", "cancelled")
			s.publishInventoryOutOfStock(ctx, env.Data.OrderID, "out_of_stock")
			s.publishOrderCancelled(ctx, env.Data.OrderID, "out_of_stock")
			return nil
		}
		return err
	}

	s.publishInventoryReserved(ctx, env.Data.OrderID)
	return nil
}

func (s *Service) tryCreateReservation(ctx context.Context, orderID string) (bool, error) {
	key := sharedredis.Key("reservation:order", orderID)
	zkey := "reservations:orders"
	exp := time.Now().Add(s.reservationTTL)

	ok, err := s.redis.SetNX(ctx, key, "1", s.reservationTTL).Result()
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}

	if err := s.redis.ZAdd(ctx, zkey, redis.Z{Score: float64(exp.Unix()), Member: orderID}).Err(); err != nil {
		_ = s.redis.Del(ctx, key).Err()
		return false, err
	}
	return true, nil
}

func (s *Service) cleanupReservation(ctx context.Context, orderID string) {
	key := sharedredis.Key("reservation:order", orderID)
	_ = s.redis.Del(ctx, key).Err()
	_ = s.redis.ZRem(ctx, "reservations:orders", orderID).Err()
}

func (s *Service) sweepExpiredReservations(ctx context.Context) error {
	if s.sweepInterval <= 0 {
		return nil
	}
	t := time.NewTicker(s.sweepInterval)
	defer t.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
			now := time.Now().Unix()
			expired, err := s.redis.ZRangeByScore(ctx, "reservations:orders", &redis.ZRangeBy{
				Min: "-inf",
				Max: strconv.FormatInt(now, 10),
				// Keep batch small.
				Offset: 0,
				Count:  50,
			}).Result()
			if err != nil {
				continue
			}

			for _, orderID := range expired {
				s.handleExpiredReservation(ctx, orderID)
			}
		}
	}
}

func (s *Service) handleExpiredReservation(ctx context.Context, orderID string) {
	// If the reservation key still exists, it hasn't expired yet; ignore.
	key := sharedredis.Key("reservation:order", orderID)
	exists, err := s.redis.Exists(ctx, key).Result()
	if err == nil && exists == 1 {
		ttl, err := s.redis.TTL(ctx, key).Result()
		if err == nil && ttl > 0 {
			exp := time.Now().Add(ttl)
			_ = s.redis.ZAdd(ctx, "reservations:orders", redis.Z{Score: float64(exp.Unix()), Member: orderID}).Err()
		} else {
			_ = s.redis.ZRem(ctx, "reservations:orders", orderID).Err()
		}
		return
	}

	oid, err := uuid.Parse(orderID)
	if err != nil {
		s.cleanupReservation(ctx, orderID)
		return
	}

	// Only cancel if still awaiting payment.
	updated, err := s.repo.UpdateOrderStatusIf(ctx, oid, "payment_required", "cancelled")
	if err == nil && updated {
		_ = s.repo.Release(ctx, oid)
		s.publishInventoryReleased(ctx, orderID, "reservation_expired")
		s.publishOrderCancelled(ctx, orderID, "reservation_expired")
	}

	s.cleanupReservation(ctx, orderID)
}

func (s *Service) hasReservation(ctx context.Context, orderID string) bool {
	key := sharedredis.Key("reservation:order", orderID)
	exists, err := s.redis.Exists(ctx, key).Result()
	if err != nil {
		return true
	}
	return exists == 1
}

func (s *Service) markEventProcessed(ctx context.Context, eventID string) bool {
	if eventID == "" {
		return true
	}
	sum := sha256.Sum256([]byte(eventID))
	key := "processed:event:" + hex.EncodeToString(sum[:])
	ok, err := s.redis.SetNX(ctx, key, "1", s.processedEventTTL).Result()
	if err != nil {
		// fail open to avoid stalling the system
		return true
	}
	return ok
}

func (s *Service) publishInventoryReserved(ctx context.Context, orderID string) {
	payload := events.Envelope[events.InventoryReservedData]{
		EventID:     uuid.NewString(),
		Type:        events.TypeInventoryReserved,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.InventoryReservedData{OrderID: orderID},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicInventoryReserved, []byte(orderID), b)
}

func (s *Service) publishInventoryOutOfStock(ctx context.Context, orderID, reason string) {
	payload := events.Envelope[events.InventoryOutOfStockData]{
		EventID:     uuid.NewString(),
		Type:        events.TypeInventoryOutOfStock,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.InventoryOutOfStockData{OrderID: orderID, Reason: reason},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicInventoryOutOfStock, []byte(orderID), b)
}

func (s *Service) publishInventoryReleased(ctx context.Context, orderID, reason string) {
	payload := events.Envelope[events.InventoryReleasedData]{
		EventID:     uuid.NewString(),
		Type:        events.TypeInventoryReleased,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.InventoryReleasedData{OrderID: orderID, Reason: reason},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicInventoryReleased, []byte(orderID), b)
}

func (s *Service) publishOrderCancelled(ctx context.Context, orderID, reason string) {
	payload := events.Envelope[events.OrdersCancelledData]{
		EventID:     uuid.NewString(),
		Type:        events.TypeOrdersCancelled,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.OrdersCancelledData{OrderID: orderID, Reason: reason},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicOrdersCancelled, []byte(orderID), b)
}
