package service

import (
	"context"

	"github.com/kalen1o/iphone-storage/apps/order-service/internal/order/repo"
	"github.com/kalen1o/iphone-storage/shared/logging"
)

type Service struct {
	repo *repo.Repository
	log  *logging.Logger
}

func New(r *repo.Repository, log *logging.Logger) *Service {
	return &Service{repo: r, log: log}
}

func (s *Service) Run(ctx context.Context) error {
	s.log.Info("service running (stub)", nil)
	<-ctx.Done()
	return ctx.Err()
}
