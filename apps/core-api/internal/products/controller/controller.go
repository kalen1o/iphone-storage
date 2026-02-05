package controller

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/platform/httpjson"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/products/repo"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/products/service"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/util"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

type ProductsListResponse struct {
	Items []repo.Product `json:"items"`
}

// GetProducts godoc
// @Summary List products
// @Tags products
// @Produce json
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} ProductsListResponse
// @Router /api/products [get]
func (c *Controller) GetProducts(w http.ResponseWriter, r *http.Request) {
	limit := parseIntQuery(r, "limit", 20)
	offset := parseIntQuery(r, "offset", 0)

	products, err := c.svc.List(r.Context(), limit, offset)
	if err != nil {
		httpjson.WriteError(w, http.StatusInternalServerError, "failed to list products")
		return
	}
	httpjson.WriteJSON(w, http.StatusOK, map[string]any{"items": products})
}

// GetProductByID godoc
// @Summary Get product by ID
// @Tags products
// @Produce json
// @Param id path string true "Product ID (uuid)"
// @Success 200 {object} repo.Product
// @Failure 404 {object} map[string]any
// @Router /api/products/{id} [get]
func (c *Controller) GetProductByID(w http.ResponseWriter, r *http.Request) {
	idRaw := mux.Vars(r)["id"]
	id, err := uuid.Parse(idRaw)
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	product, err := c.svc.GetByID(r.Context(), id)
	if err != nil {
		if util.IsNotFound(err) {
			httpjson.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpjson.WriteError(w, http.StatusInternalServerError, "failed to get product")
		return
	}

	httpjson.WriteJSON(w, http.StatusOK, product)
}

func parseIntQuery(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return i
}
