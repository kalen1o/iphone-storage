package main

// @title Payment Service
// @version 0.1.0
// @description Payment worker service.
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

	_ "github.com/kalen1o/iphone-storage/apps/payment-service/docs"
	paymentcontroller "github.com/kalen1o/iphone-storage/apps/payment-service/internal/payment/controller"
	paymentrepo "github.com/kalen1o/iphone-storage/apps/payment-service/internal/payment/repo"
	paymentservice "github.com/kalen1o/iphone-storage/apps/payment-service/internal/payment/service"
	"github.com/kalen1o/iphone-storage/shared/config"
	"github.com/kalen1o/iphone-storage/shared/kafka"
	"github.com/kalen1o/iphone-storage/shared/logging"
	"github.com/kalen1o/iphone-storage/shared/redis"
	"github.com/jackc/pgx/v5/pgxpool"
	httpSwagger "github.com/swaggo/http-swagger/v2"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log := logging.New("payment-service", cfg.Service.Environment)
	log.Info("service starting", map[string]any{
		"kafka_brokers": cfg.Kafka.Brokers,
		"group_id":      cfg.Kafka.GroupID,
	})

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.Database.DSN())
	if err != nil {
		log.Error("failed to connect to database", map[string]any{"err": err.Error()})
		os.Exit(1)
	}
	defer pool.Close()

	redisClient := redis.New(cfg.Redis)
	defer func() { _ = redisClient.Close() }()
	_ = redis.Ping(ctx, redisClient)

	producer := kafka.NewProducer(cfg.Kafka.Brokers, cfg.Kafka.ClientID)
	defer func() { _ = producer.Close() }()

	r := paymentrepo.NewPostgres(pool)
	svc := paymentservice.New(r, redisClient, producer, log)
	ctrl := paymentcontroller.New(svc)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	runCtx, cancel := context.WithCancel(context.Background())
	go func() {
		<-stop
		cancel()
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", paymentHealth)
	mux.HandleFunc("/version", paymentVersion)
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
	go func() { errCh <- ctrl.Run(runCtx, cfg.Kafka.Brokers, cfg.Kafka.GroupID) }()

	<-runCtx.Done()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	_ = <-errCh

	log.Info("shutdown complete", nil)
}

// paymentHealth godoc
// @Summary Health check
// @Tags health
// @Produce plain
// @Success 200 {string} string "ok"
// @Router /health [get]
func paymentHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

// paymentVersion godoc
// @Summary Version info
// @Tags health
// @Produce json
// @Success 200 {object} map[string]any
// @Router /version [get]
func paymentVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"service": "payment-service", "version": "dev"})
}
