package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/repo"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/service"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/http/middleware"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/platform/httpjson"
)

type Controller struct {
	svc *service.Service
}

func New(svc *service.Service) *Controller {
	return &Controller{svc: svc}
}

type RegisterRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string    `json:"token"`
	User  repo.User `json:"user"`
}

// Register godoc
// @Summary Register user
// @Tags auth
// @Accept json
// @Produce json
// @Param body body RegisterRequest true "Register"
// @Success 201 {object} AuthResponse
// @Failure 400 {object} map[string]any
// @Router /api/auth/register [post]
func (c *Controller) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	token, user, err := c.svc.Register(r.Context(), service.RegisterInput{
		Email:     req.Email,
		Password:  req.Password,
		FirstName: req.FirstName,
		LastName:  req.LastName,
	})
	if err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "registration failed")
		return
	}

	httpjson.WriteJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user":  user,
	})
}

// Login godoc
// @Summary Login user
// @Tags auth
// @Accept json
// @Produce json
// @Param body body LoginRequest true "Login"
// @Success 200 {object} AuthResponse
// @Failure 401 {object} map[string]any
// @Router /api/auth/login [post]
func (c *Controller) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	token, user, err := c.svc.Login(r.Context(), service.LoginInput{Email: req.Email, Password: req.Password})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpjson.WriteError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		httpjson.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	httpjson.WriteJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  user,
	})
}

// Me godoc
// @Summary Current user
// @Tags auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} repo.User
// @Failure 401 {object} map[string]any
// @Router /api/auth/me [get]
func (c *Controller) Me(w http.ResponseWriter, r *http.Request) {
	email, ok := middleware.EmailFromContext(r.Context())
	if !ok {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	u, err := c.svc.GetUserByEmail(r.Context(), email)
	if err != nil {
		httpjson.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	httpjson.WriteJSON(w, http.StatusOK, u)
}
