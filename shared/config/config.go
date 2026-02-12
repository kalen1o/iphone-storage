package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds application configuration loaded from environment variables.
type Config struct {
	Database  DatabaseConfig
	Kafka     KafkaConfig
	Redis     RedisConfig
	Service   ServiceConfig
	JWT       JWTConfig
	RateLimit RateLimitConfig
}

type DatabaseConfig struct {
	Host              string
	Port              int
	User              string
	Password          string
	DBName            string
	SSLMode           string
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
	ConnectTimeout    time.Duration
}

type KafkaConfig struct {
	Brokers  []string
	ClientID string
	GroupID  string
	Timeout  time.Duration
	Retries  int
}

type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
	Timeout  time.Duration
}

type ServiceConfig struct {
	Port        int
	LogLevel    string
	Environment string
}

type JWTConfig struct {
	Secret string
	Expiry time.Duration
}

type RateLimitConfig struct {
	RequestsPerMinute int
}

func Load() (*Config, error) {
	return &Config{
		Database: DatabaseConfig{
			Host:              getEnv("DB_HOST", "localhost"),
			Port:              getEnvAsInt("DB_PORT", 5432),
			User:              getEnv("DB_USER", "postgres"),
			Password:          getEnv("DB_PASSWORD", ""),
			DBName:            getEnv("DB_NAME", "online_storage"),
			SSLMode:           getEnv("DB_SSL_MODE", "disable"),
			MaxConns:          getEnvAsInt32("DB_MAX_CONNS", 25),
			MinConns:          getEnvAsInt32("DB_MIN_CONNS", 5),
			MaxConnLifetime:   getEnvAsDuration("DB_MAX_CONN_LIFETIME", time.Hour),
			MaxConnIdleTime:   getEnvAsDuration("DB_MAX_CONN_IDLE_TIME", 30*time.Minute),
			HealthCheckPeriod: getEnvAsDuration("DB_HEALTH_CHECK_PERIOD", time.Minute),
			ConnectTimeout:    getEnvAsDuration("DB_CONNECT_TIMEOUT", 5*time.Second),
		},
		Kafka: KafkaConfig{
			Brokers:  getEnvAsSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			ClientID: getEnv("KAFKA_CLIENT_ID", "service"),
			GroupID:  getEnv("KAFKA_GROUP_ID", "service-group"),
			Timeout:  getEnvAsDuration("KAFKA_TIMEOUT", 10*time.Second),
			Retries:  getEnvAsInt("KAFKA_RETRIES", 3),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnvAsInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvAsInt("REDIS_DB", 0),
			Timeout:  getEnvAsDuration("REDIS_TIMEOUT", 5*time.Second),
		},
		Service: ServiceConfig{
			Port:        getEnvAsInt("SERVICE_PORT", 8080),
			LogLevel:    getEnv("LOG_LEVEL", "info"),
			Environment: getEnv("ENVIRONMENT", "development"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "change-me"),
			Expiry: getEnvAsDuration("JWT_EXPIRY", 24*time.Hour),
		},
		RateLimit: RateLimitConfig{
			RequestsPerMinute: getEnvAsInt("RATE_LIMIT_REQUESTS_PER_MINUTE", 60),
		},
	}, nil
}

func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode,
	)
}

func (c *RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvAsInt32(key string, defaultValue int32) int32 {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.ParseInt(value, 10, 32); err == nil {
			return int32(intVal)
		}
	}
	return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string) []string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return defaultValue
	}
	return out
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
