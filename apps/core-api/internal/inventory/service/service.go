package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/inventory/repo"
)

type Service struct {
	repo *repo.Postgres
}

func New(r *repo.Postgres) *Service {
	return &Service{repo: r}
}

func (s *Service) GetInStockByProductIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]bool, error) {
	availableByID, err := s.repo.GetAvailableByProductIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		available, ok := availableByID[id]
		out[id] = ok && available > 0
	}
	return out, nil
}

func (s *Service) GetInStockByProductID(ctx context.Context, id uuid.UUID) (bool, error) {
	available, err := s.repo.GetAvailableByProductID(ctx, id)
	if err != nil {
		return false, err
	}
	return available > 0, nil
}
