package controller

import (
	"context"

	"github.com/kalen1o/iphone-storage/apps/order-service/internal/order/service"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

func (c *Controller) Run(ctx context.Context) error {
	return c.svc.Run(ctx)
}
