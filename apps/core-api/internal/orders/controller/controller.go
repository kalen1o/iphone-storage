package controller

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/http/middleware"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/repo"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/service"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/platform/httpjson"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/util"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

// CreateOrder godoc
// @Summary Create order
// @Tags orders
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body repo.CreateOrderInput true "Order"
// @Success 201 {object} repo.Order
// @Failure 400 {object} map[string]any
// @Router /api/orders [post]
func (c *Controller) CreateOrder(w http.ResponseWriter, r *http.Request) {
	userIDRaw, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID, err := uuid.Parse(userIDRaw)
	if err != nil {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input repo.CreateOrderInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if strings.TrimSpace(input.ShippingAddressText) == "" {
		httpjson.WriteError(w, http.StatusBadRequest, "shipping_address_text is required")
		return
	}

	order, err := c.svc.Create(r.Context(), userID, input)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "failed to create order")
		return
	}

	httpjson.WriteJSON(w, http.StatusCreated, order)
}

// GetOrder godoc
// @Summary Get order by ID
// @Tags orders
// @Produce json
// @Security BearerAuth
// @Param id path string true "Order ID (uuid)"
// @Success 200 {object} repo.Order
// @Failure 404 {object} map[string]any
// @Router /api/orders/{id} [get]
func (c *Controller) GetOrder(w http.ResponseWriter, r *http.Request) {
	userIDRaw, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	userID, err := uuid.Parse(userIDRaw)
	if err != nil {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	orderIDRaw := mux.Vars(r)["id"]
	orderID, err := uuid.Parse(orderIDRaw)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	order, err := c.svc.GetByIDForUser(r.Context(), orderID, userID)
	if err != nil {
		if util.IsNotFound(err) {
			httpjson.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpjson.WriteError(w, http.StatusInternalServerError, "failed to get order")
		return
	}

	httpjson.WriteJSON(w, http.StatusOK, order)
}
