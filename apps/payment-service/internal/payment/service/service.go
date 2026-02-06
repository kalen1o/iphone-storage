package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"time"

	"github.com/google/uuid"
	redis "github.com/redis/go-redis/v9"

	paymentrepo "github.com/kalen1o/iphone-storage/apps/payment-service/internal/payment/repo"
	"github.com/kalen1o/iphone-storage/shared/events"
	sharedkafka "github.com/kalen1o/iphone-storage/shared/kafka"
	"github.com/kalen1o/iphone-storage/shared/logging"
	sharedredis "github.com/kalen1o/iphone-storage/shared/redis"
)

type Service struct {
	repo     *paymentrepo.Postgres
	log      *logging.Logger
	redis    *redis.Client
	producer *sharedkafka.Producer

	processedEventTTL time.Duration
}

func New(r *paymentrepo.Postgres, redisClient *redis.Client, producer *sharedkafka.Producer, log *logging.Logger) *Service {
	return &Service{
		repo:              r,
		redis:             redisClient,
		producer:          producer,
		log:               log,
		processedEventTTL: envDuration("PAYMENT_PROCESSED_EVENT_TTL", 24*time.Hour),
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
		"processed_event_ttl": s.processedEventTTL.String(),
	})
	return s.consumeInventoryReserved(ctx, brokers, groupID)
}

func (s *Service) consumeInventoryReserved(ctx context.Context, brokers []string, groupID string) error {
	c := sharedkafka.NewConsumer(sharedkafka.ConsumerConfig{
		Brokers: brokers,
		GroupID: groupID,
		Topic:   events.TopicInventoryReserved,
	})
	defer func() { _ = c.Close() }()

	for {
		msg, err := c.Fetch(ctx)
		if err != nil {
			return err
		}

		var env events.Envelope[events.InventoryReservedData]
		if err := events.Unmarshal(msg.Value, &env); err != nil {
			_ = c.Commit(ctx, msg)
			continue
		}

		if !s.markEventProcessed(ctx, env.EventID) {
			_ = c.Commit(ctx, msg)
			continue
		}

		if err := s.handleInventoryReserved(ctx, env); err != nil {
			s.log.Error("failed to handle inventory.reserved", map[string]any{
				"err":      err.Error(),
				"order_id": env.Data.OrderID,
			})
		}

		_ = c.Commit(ctx, msg)
	}
}

func (s *Service) handleInventoryReserved(ctx context.Context, env events.Envelope[events.InventoryReservedData]) error {
	if env.Data.OrderID == "" {
		return errors.New("missing order_id")
	}
	orderID, err := uuid.Parse(env.Data.OrderID)
	if err != nil {
		return err
	}

	// Ensure reservation is still active (avoid charging after timeout).
	if s.redis != nil {
		key := sharedredis.Key("reservation:order", env.Data.OrderID)
		exists, err := s.redis.Exists(ctx, key).Result()
		if err == nil && exists == 0 {
			return nil
		}
	}

	succeeded := fakePaymentOutcome(env.Data.OrderID)
	res, err := s.repo.CreateOrUpdatePaymentAndSetOrderStatus(ctx, orderID, succeeded)
	if err != nil {
		if errors.Is(err, paymentrepo.ErrNotPaymentRequired) {
			return nil
		}
		return err
	}

	if succeeded {
		s.publishOrdersPaid(ctx, env.Data.OrderID)
		s.publishPaymentSucceeded(ctx, env.Data.OrderID, res.PaymentID.String())
		return nil
	}
	s.publishOrdersCancelled(ctx, env.Data.OrderID, "payment_failed")
	s.publishPaymentFailed(ctx, env.Data.OrderID, res.PaymentID.String(), "payment_failed")
	return nil
}

func fakePaymentOutcome(orderID string) bool {
	sum := sha256.Sum256([]byte(orderID))
	// Deterministic ~50/50 split for idempotency across retries.
	return sum[0] < 128
}

func (s *Service) markEventProcessed(ctx context.Context, eventID string) bool {
	if s.redis == nil || eventID == "" {
		return true
	}
	sum := sha256.Sum256([]byte(eventID))
	key := "processed:event:" + hex.EncodeToString(sum[:])
	ok, err := s.redis.SetNX(ctx, key, "1", s.processedEventTTL).Result()
	if err != nil {
		return true
	}
	return ok
}

func (s *Service) publishPaymentSucceeded(ctx context.Context, orderID, paymentID string) {
	payload := events.Envelope[events.PaymentsSucceededData]{
		EventID:     uuid.NewString(),
		Type:        events.TypePaymentsSucceeded,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.PaymentsSucceededData{OrderID: orderID, PaymentID: paymentID},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicPaymentsSucceeded, []byte(orderID), b)
}

func (s *Service) publishPaymentFailed(ctx context.Context, orderID, paymentID, reason string) {
	payload := events.Envelope[events.PaymentsFailedData]{
		EventID:     uuid.NewString(),
		Type:        events.TypePaymentsFailed,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.PaymentsFailedData{OrderID: orderID, PaymentID: paymentID, Reason: reason},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicPaymentsFailed, []byte(orderID), b)
}

func (s *Service) publishOrdersPaid(ctx context.Context, orderID string) {
	payload := events.Envelope[events.OrdersPaidData]{
		EventID:     uuid.NewString(),
		Type:        events.TypeOrdersPaid,
		OccurredAt:  time.Now().UTC(),
		AggregateID: orderID,
		Data:        events.OrdersPaidData{OrderID: orderID},
	}
	b, err := events.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.producer.Publish(ctx, events.TopicOrdersPaid, []byte(orderID), b)
}

func (s *Service) publishOrdersCancelled(ctx context.Context, orderID, reason string) {
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
