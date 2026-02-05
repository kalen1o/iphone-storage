package main

// @title Core API
// @version 0.1.0
// @description Core API for the online-storage system.
// @BasePath /
// @schemes http
//
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/kalen1o/iphone-storage/apps/core-api/docs"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/http/middleware"
	"github.com/kalen1o/iphone-storage/shared/config"
	"github.com/kalen1o/iphone-storage/shared/logging"

	authcontroller "github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/controller"
	authrepo "github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/repo"
	authservice "github.com/kalen1o/iphone-storage/apps/core-api/internal/auth/service"
	ordercontroller "github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/controller"
	orderrepo "github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/repo"
	orderservice "github.com/kalen1o/iphone-storage/apps/core-api/internal/orders/service"
	"github.com/kalen1o/iphone-storage/apps/core-api/internal/platform/httpjson"
	productcontroller "github.com/kalen1o/iphone-storage/apps/core-api/internal/products/controller"
	productrepo "github.com/kalen1o/iphone-storage/apps/core-api/internal/products/repo"
	productservice "github.com/kalen1o/iphone-storage/apps/core-api/internal/products/service"
	httpSwagger "github.com/swaggo/http-swagger/v2"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log := logging.New("core-api", cfg.Service.Environment)

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.Database.DSN())
	if err != nil {
		log.Error("failed to connect to database", map[string]any{"err": err.Error()})
		os.Exit(1)
	}
	defer pool.Close()

	jwt := authservice.NewJWT(cfg.JWT.Secret, cfg.JWT.Expiry)

	authRepo := authrepo.NewPostgres(pool)
	authSvc := authservice.New(authRepo, jwt)
	authCtrl := authcontroller.New(authSvc)

	productsRepo := productrepo.NewPostgres(pool)
	productsSvc := productservice.New(productsRepo)
	productsCtrl := productcontroller.New(productsSvc)

	ordersRepo := orderrepo.NewPostgres(pool)
	ordersSvc := orderservice.New(ordersRepo)
	ordersCtrl := ordercontroller.New(ordersSvc)

	router := mux.NewRouter()
	router.Use(middleware.Logging(log))
	router.Use(middleware.CORS())

	router.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}).Methods(http.MethodGet)
	router.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		httpjson.WriteJSON(w, http.StatusOK, map[string]any{
			"service": "core-api",
			"version": "dev",
		})
	}).Methods(http.MethodGet)

	api := router.PathPrefix("/api").Subrouter()
	api.HandleFunc("/auth/register", authCtrl.Register).Methods(http.MethodPost)
	api.HandleFunc("/auth/login", authCtrl.Login).Methods(http.MethodPost)
	api.HandleFunc("/products", productsCtrl.GetProducts).Methods(http.MethodGet)
	api.HandleFunc("/products/{id}", productsCtrl.GetProductByID).Methods(http.MethodGet)

	protected := api.PathPrefix("").Subrouter()
	protected.Use(middleware.NewAuthMiddleware(jwt).Authenticate)
	protected.HandleFunc("/orders", ordersCtrl.CreateOrder).Methods(http.MethodPost)
	protected.HandleFunc("/orders/{id}", ordersCtrl.GetOrder).Methods(http.MethodGet)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Service.Port),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("http server starting", map[string]any{"addr": srv.Addr})
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("http server stopped unexpectedly", map[string]any{"err": err.Error()})
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Info("shutdown complete", nil)
}
