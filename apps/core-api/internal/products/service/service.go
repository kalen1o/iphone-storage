package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/products/repo"
)

type Service struct {
	repo repo.Repository
}

func New(r repo.Repository) *Service {
	return &Service{repo: r}
}

func (s *Service) List(ctx context.Context, limit, offset int) ([]repo.Product, error) {
	return s.repo.List(ctx, limit, offset)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*repo.Product, error) {
	return s.repo.GetByID(ctx, id)
}
