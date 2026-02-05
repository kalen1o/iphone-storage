package main

// @title Inventory Service
// @version 0.1.0
// @description Inventory worker service.
// @BasePath /
// @schemes http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/kalen1o/iphone-storage/apps/inventory-service/docs"
	inventorycontroller "github.com/kalen1o/iphone-storage/apps/inventory-service/internal/inventory/controller"
	inventoryrepo "github.com/kalen1o/iphone-storage/apps/inventory-service/internal/inventory/repo"
	inventoryservice "github.com/kalen1o/iphone-storage/apps/inventory-service/internal/inventory/service"
	"github.com/kalen1o/iphone-storage/shared/config"
	"github.com/kalen1o/iphone-storage/shared/logging"
	httpSwagger "github.com/swaggo/http-swagger/v2"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log := logging.New("inventory-service", cfg.Service.Environment)
	log.Info("service starting (stub)", map[string]any{
		"kafka_brokers": cfg.Kafka.Brokers,
		"group_id":      cfg.Kafka.GroupID,
	})

	r := inventoryrepo.New()
	svc := inventoryservice.New(r, log)
	ctrl := inventorycontroller.New(svc)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-stop
		cancel()
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", inventoryHealth)
	mux.HandleFunc("/version", inventoryVersion)
	mux.Handle("/swagger/", httpSwagger.WrapHandler)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Service.Port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("http server starting", map[string]any{"addr": srv.Addr})
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("http server stopped unexpectedly", map[string]any{"err": err.Error()})
			cancel()
		}
	}()

	errCh := make(chan error, 1)
	go func() { errCh <- ctrl.Run(ctx) }()

	<-ctx.Done()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	_ = <-errCh

	log.Info("shutdown complete", nil)
}

// inventoryHealth godoc
// @Summary Health check
// @Tags health
// @Produce plain
// @Success 200 {string} string "ok"
// @Router /health [get]
func inventoryHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

// inventoryVersion godoc
// @Summary Version info
// @Tags health
// @Produce json
// @Success 200 {object} map[string]any
// @Router /version [get]
func inventoryVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"service": "inventory-service", "version": "dev"})
}
