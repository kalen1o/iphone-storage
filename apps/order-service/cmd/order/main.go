package main

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/kalen1o/iphone-storage/shared/config"
	"github.com/kalen1o/iphone-storage/shared/logging"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log := logging.New("order-service", cfg.Service.Environment)
	log.Info("service starting (stub)", map[string]any{
		"kafka_brokers": cfg.Kafka.Brokers,
		"group_id":      cfg.Kafka.GroupID,
	})

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Info("shutdown complete", nil)
}

