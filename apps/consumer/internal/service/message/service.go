package service

import (
	"context"
	"encoding/json"
	"fmt"

	"apps/consumer/internal/domain"
	internalgms "apps/consumer/internal/gsm"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

// Publisher publishes a status update to the sms.success queue.
type Publisher interface {
	Publish(ctx context.Context, body []byte) error
}

// MessageService handles SMS delivery events from the queue.
type MessageService interface {
	Handle(ctx context.Context, delivery amqp.Delivery) error
}

type messageService struct {
	pool      *internalgms.Pool
	publisher Publisher
	log       *zap.Logger
}

// New creates a message service that consumes events and dispatches SMS.
func New(pool *internalgms.Pool, publisher Publisher, log *zap.Logger) MessageService {
	return &messageService{pool: pool, publisher: publisher, log: log}
}

// Handle processes a single delivery from the sms.send queue.
func (s *messageService) Handle(ctx context.Context, delivery amqp.Delivery) error {
	var event domain.MessageEvent
	if err := json.Unmarshal(delivery.Body, &event); err != nil {
		delivery.Nack(false, false)
		return fmt.Errorf("unmarshal event: %w", err)
	}

	status := "sent"
	if err := s.pool.Send(event.To, event.Body); err != nil {
		s.log.Error("sms send failed", zap.String("id", event.ID), zap.Error(err))
		status = "failed"
	}

	payload, err := json.Marshal(domain.StatusUpdate{ID: event.ID, Status: status})
	if err != nil {
		delivery.Nack(false, true)
		return fmt.Errorf("marshal status update: %w", err)
	}

	if err := s.publisher.Publish(ctx, payload); err != nil {
		delivery.Nack(false, true)
		return fmt.Errorf("publish status update: %w", err)
	}

	return delivery.Ack(false)
}
