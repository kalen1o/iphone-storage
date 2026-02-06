package controller

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/inventory/service"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/platform/httpjson"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/util"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

type Availability struct {
	ProductID string `json:"product_id"`
	InStock   bool   `json:"in_stock"`
}

type InventoryListResponse struct {
	Items []Availability `json:"items"`
}

// GetInventory godoc
// @Summary Get inventory availability
// @Tags inventory
// @Produce json
// @Param product_ids query string false "Comma-separated product IDs (uuid)"
// @Success 200 {object} InventoryListResponse
// @Router /api/inventory [get]
func (c *Controller) GetInventory(w http.ResponseWriter, r *http.Request) {
	ids, err := parseProductIDsQuery(r)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	inStockByID, err := c.svc.GetInStockByProductIDs(r.Context(), ids)
	if err != nil {
		httpjson.WriteError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}

	items := make([]Availability, 0, len(ids))
	for _, id := range ids {
		items = append(items, Availability{
			ProductID: id.String(),
			InStock:   inStockByID[id],
		})
	}
	httpjson.WriteJSON(w, http.StatusOK, InventoryListResponse{Items: items})
}

// GetInventoryByProductID godoc
// @Summary Get inventory availability for a product
// @Tags inventory
// @Produce json
// @Param id path string true "Product ID (uuid)"
// @Success 200 {object} Availability
// @Failure 404 {object} map[string]any
// @Router /api/inventory/{id} [get]
func (c *Controller) GetInventoryByProductID(w http.ResponseWriter, r *http.Request) {
	idRaw := mux.Vars(r)["id"]
	id, err := uuid.Parse(idRaw)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	inStock, err := c.svc.GetInStockByProductID(r.Context(), id)
	if err != nil {
		if util.IsNotFound(err) {
			httpjson.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpjson.WriteError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}

	httpjson.WriteJSON(w, http.StatusOK, Availability{
		ProductID: id.String(),
		InStock:   inStock,
	})
}

func parseProductIDsQuery(r *http.Request) ([]uuid.UUID, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("product_ids"))
	if raw == "" {
		return []uuid.UUID{}, nil
	}

	parts := strings.Split(raw, ",")
	if len(parts) > 100 {
		return nil, httpError("too many product_ids (max 100)")
	}

	out := make([]uuid.UUID, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := uuid.Parse(part)
		if err != nil {
			return nil, httpError("invalid product_ids")
		}
		out = append(out, id)
	}
	return out, nil
}

type httpError string

func (e httpError) Error() string { return string(e) }
