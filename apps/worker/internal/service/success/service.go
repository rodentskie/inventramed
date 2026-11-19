package success

import (
	"context"
	"encoding/json"
	"fmt"

	"apps/worker/internal/domain"
	repository "apps/worker/internal/repository/message"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

type SuccessService interface {
	Handle(ctx context.Context, delivery amqp.Delivery) error
}

type successService struct {
	repo repository.MessageRepository
	log  *zap.Logger
}

func New(repo repository.MessageRepository, log *zap.Logger) SuccessService {
	return &successService{repo: repo, log: log}
}

func (s *successService) Handle(ctx context.Context, delivery amqp.Delivery) error {
	var update domain.StatusUpdate
	if err := json.Unmarshal(delivery.Body, &update); err != nil {
		delivery.Nack(false, false)
		return fmt.Errorf("unmarshal status update: %w", err)
	}

	if err := s.repo.UpdateStatus(ctx, update.ID, update.Status); err != nil {
		delivery.Nack(false, true)
		return fmt.Errorf("update message status: %w", err)
	}

	s.log.Info("message status updated", zap.String("id", update.ID), zap.String("status", update.Status))
	return delivery.Ack(false)
}
