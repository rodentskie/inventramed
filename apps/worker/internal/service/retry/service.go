package retry

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"apps/worker/internal/domain"
	repository "apps/worker/internal/repository/message"

	"go.uber.org/zap"
)

type Publisher interface {
	Publish(ctx context.Context, body []byte) error
}

type RetryService interface {
	Run(ctx context.Context) error
}

type retryService struct {
	repo      repository.MessageRepository
	publisher Publisher
	log       *zap.Logger
	mu        sync.Mutex
}

func New(repo repository.MessageRepository, publisher Publisher, log *zap.Logger) RetryService {
	return &retryService{repo: repo, publisher: publisher, log: log}
}

// Run polls for failed messages and requeues or exhausts them.
// A mutex prevents overlapping runs if a poll takes longer than the interval.
func (s *retryService) Run(ctx context.Context) error {
	if !s.mu.TryLock() {
		s.log.Info("retry run already in progress, skipping")
		return nil
	}
	defer s.mu.Unlock()

	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return fmt.Errorf("fetch settings: %w", err)
	}

	msgs, err := s.repo.GetFailedMessages(ctx, int(settings.RetryWindowDays))
	if err != nil {
		return fmt.Errorf("fetch failed messages: %w", err)
	}

	s.log.Info("retry run", zap.Int("candidates", len(msgs)))

	for _, msg := range msgs {
		if err := s.process(ctx, msg, settings.RetryLimit); err != nil {
			s.log.Error("failed to process message", zap.String("id", msg.ID), zap.Error(err))
		}
	}
	return nil
}

func (s *retryService) process(ctx context.Context, msg domain.Message, retryLimit int16) error {
	if msg.RetryCount >= retryLimit {
		if err := s.repo.UpdateStatus(ctx, msg.ID, "exhausted"); err != nil {
			return fmt.Errorf("mark exhausted: %w", err)
		}
		s.log.Info("message exhausted", zap.String("id", msg.ID))
		return nil
	}

	payload, err := json.Marshal(domain.MessageEvent{ID: msg.ID, To: msg.To, Body: msg.Body})
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	if err := s.publisher.Publish(ctx, payload); err != nil {
		return fmt.Errorf("publish retry: %w", err)
	}

	if err := s.repo.IncrementRetryCount(ctx, msg.ID); err != nil {
		return fmt.Errorf("increment retry count: %w", err)
	}

	s.log.Info("message requeued", zap.String("id", msg.ID), zap.Int16("retry_count", msg.RetryCount+1))
	return nil
}
