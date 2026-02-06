package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/kalen1o/iphone-storage/shared/config"
	redis "github.com/redis/go-redis/v9"
)

func New(cfg config.RedisConfig) *redis.Client {
	opts := &redis.Options{
		Addr:        cfg.Addr(),
		Password:    cfg.Password,
		DB:          cfg.DB,
		DialTimeout: cfg.Timeout,
	}
	return redis.NewClient(opts)
}

func Ping(ctx context.Context, c *redis.Client) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return c.Ping(ctx).Err()
}

func Key(prefix, id string) string {
	return fmt.Sprintf("%s:%s", prefix, id)
}

