package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/repo"
	"github.com/kalen1o/iphone-storage/shared/events"
	"github.com/kalen1o/iphone-storage/shared/kafka"
)

type Service struct {
	repo     repo.Repository
	producer *kafka.Producer
}

func New(r repo.Repository, producer *kafka.Producer) *Service {
	return &Service{repo: r, producer: producer}
}

func (s *Service) Create(ctx context.Context, userID uuid.UUID, input repo.CreateOrderInput) (*repo.Order, error) {
	order, err := s.repo.Create(ctx, userID, input)
	if err != nil {
		return nil, err
	}

	if s.producer != nil {
		items := make([]events.OrderItem, 0, len(order.Items))
		for _, it := range order.Items {
			items = append(items, events.OrderItem{
				ProductID: it.ProductID.String(),
				Quantity:  it.Quantity,
			})
		}

		payload := events.Envelope[events.OrdersCreatedData]{
			EventID:     uuid.NewString(),
			Type:        events.TypeOrdersCreated,
			OccurredAt:  time.Now().UTC(),
			AggregateID: order.ID.String(),
			Data: events.OrdersCreatedData{
				OrderID:  order.ID.String(),
				UserID:   userID.String(),
				Items:    items,
				Subtotal: order.Subtotal,
				Tax:      order.Tax,
				Total:    order.Total,
				Currency: order.Currency,
			},
		}
		b, mErr := events.Marshal(payload)
		if mErr == nil {
			_ = s.producer.Publish(ctx, events.TopicOrdersCreated, []byte(order.ID.String()), b)
		}
	}

	return order, nil
}

func (s *Service) GetByIDForUser(ctx context.Context, orderID, userID uuid.UUID) (*repo.Order, error) {
	return s.repo.GetByIDForUser(ctx, orderID, userID)
}
