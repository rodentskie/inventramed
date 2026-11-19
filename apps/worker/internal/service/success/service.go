package success

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"apps/worker/internal/api"
	"apps/worker/internal/domain"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

// Reporter reports one attempt's result to the app.
type Reporter interface {
	Result(ctx context.Context, id string, input domain.ResultInput) (domain.ResultResponse, error)
}

type SuccessService interface {
	Handle(ctx context.Context, delivery amqp.Delivery) error
}

type successService struct {
	reporter     Reporter
	log          *zap.Logger
	requeueDelay time.Duration
}

// New creates the result service. requeueDelay is how long to wait before
// returning a result to the queue after a temporary failure.
func New(reporter Reporter, log *zap.Logger, requeueDelay time.Duration) SuccessService {
	return &successService{reporter: reporter, log: log, requeueDelay: requeueDelay}
}

// Handle reports one result from the sms.success queue. A result the app
// ignored as stale (applied: false) is still acknowledged.
func (s *successService) Handle(ctx context.Context, delivery amqp.Delivery) error {
	var result domain.SendResult
	if err := json.Unmarshal(delivery.Body, &result); err != nil {
		_ = delivery.Nack(false, false)
		return fmt.Errorf("unmarshal send result: %w", err)
	}

	res, err := s.reporter.Result(ctx, result.ID, domain.ResultInput{
		Attempt:       result.Attempt,
		Success:       result.Success,
		Error:         result.Error,
		ModemResponse: result.ModemResponse,
	})
	if err != nil {
		return s.fail(ctx, delivery, result.ID, err)
	}

	s.log.Info("sms result reported",
		zap.String("id", res.ID), zap.String("status", res.Status), zap.Bool("applied", res.Applied))
	return delivery.Ack(false)
}

// fail drops a result the app will never accept, and requeues the rest after
// a delay, so an outage or a wrong token doesn't lose results.
func (s *successService) fail(ctx context.Context, delivery amqp.Delivery, id string, err error) error {
	if isPermanent(err) {
		_ = delivery.Nack(false, false)
		return fmt.Errorf("drop result %s: %w", id, err)
	}

	s.wait(ctx)
	_ = delivery.Nack(false, true)
	return fmt.Errorf("requeue result %s: %w", id, err)
}

// isPermanent is true for 400 (invalid input) and 404 (message gone).
func isPermanent(err error) bool {
	var apiErr *api.Error
	if !errors.As(err, &apiErr) {
		return false
	}
	return apiErr.StatusCode == http.StatusBadRequest || apiErr.StatusCode == http.StatusNotFound
}

func (s *successService) wait(ctx context.Context) {
	timer := time.NewTimer(s.requeueDelay)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
	}
}
