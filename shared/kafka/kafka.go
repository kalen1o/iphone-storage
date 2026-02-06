package kafka

import (
	"context"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	w *kafka.Writer
}

func NewProducer(brokers []string, clientID string) *Producer {
	return &Producer{
		w: &kafka.Writer{
			Addr:         kafka.TCP(brokers...),
			Balancer:     &kafka.Hash{},
			BatchTimeout: 50 * time.Millisecond,
			RequiredAcks: kafka.RequireOne,
			Async:        false,
			Transport: &kafka.Transport{
				ClientID: clientID,
			},
		},
	}
}

func (p *Producer) Publish(ctx context.Context, topic string, key, value []byte) error {
	return p.w.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   key,
		Value: value,
		Time:  time.Now(),
	})
}

func (p *Producer) Close() error { return p.w.Close() }

type Consumer struct {
	r *kafka.Reader
}

type ConsumerConfig struct {
	Brokers []string
	GroupID string
	Topic   string
}

func NewConsumer(cfg ConsumerConfig) *Consumer {
	return &Consumer{
		r: kafka.NewReader(kafka.ReaderConfig{
			Brokers:        cfg.Brokers,
			GroupID:        cfg.GroupID,
			Topic:          cfg.Topic,
			CommitInterval: time.Second,
			MinBytes:       1,
			MaxBytes:       10e6,
		}),
	}
}

func (c *Consumer) Fetch(ctx context.Context) (kafka.Message, error) { return c.r.FetchMessage(ctx) }
func (c *Consumer) Commit(ctx context.Context, msg kafka.Message) error {
	return c.r.CommitMessages(ctx, msg)
}
func (c *Consumer) Close() error { return c.r.Close() }

