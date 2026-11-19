package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"apps/consumer/internal/domain"
	internalgsm "apps/consumer/internal/gsm"
	"libs/go/gsm"
	"libs/go/mq"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

// Limits from smsResultSchema in apps/app/src/lib/validations/sms.ts. A longer
// value would make the result endpoint reject the whole report.
const (
	MAX_ERROR_LENGTH          = 500
	MAX_MODEM_RESPONSE_LENGTH = 1000
)

// Sender sends one SMS and returns the modem's "+CMGS:" line.
type Sender interface {
	Send(number, body string) (string, error)
}

// Publisher publishes a result to the sms.success queue.
type Publisher interface {
	Publish(ctx context.Context, body []byte, opts ...mq.PublishOption) error
}

// MessageService handles SMS delivery events from the queue.
type MessageService interface {
	Handle(ctx context.Context, delivery amqp.Delivery) error
}

type messageService struct {
	sender       Sender
	publisher    Publisher
	log          *zap.Logger
	requeueDelay time.Duration
}

// New creates a message service. requeueDelay is how long to wait before
// returning a message to the queue when no modem is available.
func New(sender Sender, publisher Publisher, log *zap.Logger, requeueDelay time.Duration) MessageService {
	return &messageService{sender: sender, publisher: publisher, log: log, requeueDelay: requeueDelay}
}

// Handle sends one message from the sms.send queue and publishes the result.
// A message is requeued, not reported, when no modem is available, so the
// attempt isn't used up.
func (s *messageService) Handle(ctx context.Context, delivery amqp.Delivery) error {
	var event domain.MessageEvent
	if err := json.Unmarshal(delivery.Body, &event); err != nil {
		_ = delivery.Nack(false, false)
		return fmt.Errorf("unmarshal event: %w", err)
	}

	result, err := s.send(event)
	if errors.Is(err, internalgsm.ErrNoIdleModule) {
		s.log.Warn("no gsm module available, requeueing", zap.String("id", event.ID))
		s.wait(ctx)
		_ = delivery.Nack(false, true)
		return nil
	}

	payload, err := json.Marshal(result)
	if err != nil {
		_ = delivery.Nack(false, true)
		return fmt.Errorf("marshal result: %w", err)
	}

	if err := s.publisher.Publish(ctx, payload); err != nil {
		_ = delivery.Nack(false, true)
		return fmt.Errorf("publish result: %w", err)
	}

	s.log.Info("sms handled", zap.String("id", event.ID), zap.Int("attempt", event.Attempt), zap.Bool("success", result.Success))
	return delivery.Ack(false)
}

// send checks the body, then sends it. It returns ErrNoIdleModule unchanged and
// turns every other outcome into a result to report.
func (s *messageService) send(event domain.MessageEvent) (domain.SendResult, error) {
	result := domain.SendResult{ID: event.ID, Attempt: event.Attempt}

	if reason := checkBody(event.Body); reason != "" {
		s.log.Warn("sms body rejected", zap.String("id", event.ID), zap.String("reason", reason))
		result.Error = reason
		return result, nil
	}

	ref, err := s.sender.Send(event.PhoneNumber, event.Body)
	if errors.Is(err, internalgsm.ErrNoIdleModule) {
		return result, err
	}
	if err != nil {
		s.log.Error("sms send failed", zap.String("id", event.ID), zap.Error(err))
		result.Error = truncate(err.Error(), MAX_ERROR_LENGTH)
		return result, nil
	}

	result.Success = true
	result.ModemResponse = truncate(ref, MAX_MODEM_RESPONSE_LENGTH)
	return result, nil
}

// checkBody returns why the body can't be sent as one text-mode SMS, or "".
func checkBody(body string) string {
	if gsm.HasControlChars(body) {
		return "body contains control characters"
	}
	chars, valid := gsm.GSM7Length(body)
	if !valid {
		return "body contains characters outside GSM-7"
	}
	if chars > gsm.SINGLE_SMS_LIMIT {
		return fmt.Sprintf("body is not a single GSM-7 SMS (%d chars)", chars)
	}
	return ""
}

func (s *messageService) wait(ctx context.Context) {
	timer := time.NewTimer(s.requeueDelay)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
	}
}

func truncate(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}
