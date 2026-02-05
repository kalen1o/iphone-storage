package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/repo"
)

type Service struct {
	repo repo.Repository
}

func New(r repo.Repository) *Service {
	return &Service{repo: r}
}

func (s *Service) Create(ctx context.Context, userID uuid.UUID, input repo.CreateOrderInput) (*repo.Order, error) {
	return s.repo.Create(ctx, userID, input)
}

func (s *Service) GetByIDForUser(ctx context.Context, orderID, userID uuid.UUID) (*repo.Order, error) {
	return s.repo.GetByIDForUser(ctx, orderID, userID)
}
