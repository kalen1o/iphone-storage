package events

import (
	"encoding/json"
	"time"
)

type Envelope[T any] struct {
	EventID     string    `json:"event_id"`
	Type        string    `json:"type"`
	OccurredAt  time.Time `json:"occurred_at"`
	TraceID     string    `json:"trace_id,omitempty"`
	AggregateID string    `json:"aggregate_id,omitempty"`
	Data        T         `json:"data"`
}

func Marshal[T any](e Envelope[T]) ([]byte, error) {
	return json.Marshal(e)
}

func Unmarshal[T any](b []byte, out *Envelope[T]) error {
	return json.Unmarshal(b, out)
}

