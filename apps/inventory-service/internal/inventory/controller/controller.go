package controller

import (
	"context"

	"github.com/kalen1o/iphone-storage/apps/inventory-service/internal/inventory/service"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

func (c *Controller) Run(ctx context.Context, brokers []string, groupID string) error {
	return c.svc.Run(ctx, brokers, groupID)
}
