package retry

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"apps/worker/internal/domain"
	"libs/go/mq"

	"go.uber.org/zap"
)

const (
	// TTL_MARGIN leaves time to send and report before the claim times out.
	TTL_MARGIN = 60 * time.Second
	MIN_TTL    = 30 * time.Second
)

// Claimer claims the next batch of messages from the app.
type Claimer interface {
	Claim(ctx context.Context) (domain.Claim, error)
}

// Publisher publishes to the sms.send queue and reports how many consumers it has.
type Publisher interface {
	Publish(ctx context.Context, body []byte, opts ...mq.PublishOption) error
	ConsumerCount() (int, error)
}

type RetryService interface {
	// Run claims and queues one batch. It returns the poll interval the app
	// asked for, or 0 when no claim was made.
	Run(ctx context.Context) (time.Duration, error)
}

type retryService struct {
	claimer   Claimer
	publisher Publisher
	log       *zap.Logger
	mu        sync.Mutex
}

func New(claimer Claimer, publisher Publisher, log *zap.Logger) RetryService {
	return &retryService{claimer: claimer, publisher: publisher, log: log}
}

// Run skips the claim while nothing consumes sms.send, so attempts aren't used
// up and the app's heartbeat shows the consumer as offline. A mutex prevents
// overlapping runs.
func (s *retryService) Run(ctx context.Context) (time.Duration, error) {
	if !s.mu.TryLock() {
		s.log.Info("retry run already in progress, skipping")
		return 0, nil
	}
	defer s.mu.Unlock()

	consumers, err := s.publisher.ConsumerCount()
	if err != nil {
		return 0, fmt.Errorf("count consumers: %w", err)
	}
	if consumers == 0 {
		s.log.Info("no sms consumer connected, skipping claim")
		return 0, nil
	}

	claim, err := s.claimer.Claim(ctx)
	if err != nil {
		return 0, fmt.Errorf("claim messages: %w", err)
	}

	ttl := messageTTL(claim.ClaimTimeoutSecs)
	published := 0
	for _, msg := range claim.Messages {
		if err := s.publish(ctx, msg, ttl); err != nil {
			s.log.Error("failed to queue message", zap.String("id", msg.ID), zap.Error(err))
			continue
		}
		published++
	}

	s.log.Info("retry run", zap.Int("claimed", len(claim.Messages)), zap.Int("queued", published))
	return time.Duration(claim.PollIntervalSecs) * time.Second, nil
}

// publish doesn't undo the claim on failure: the message stays SENDING until
// its claim times out, and a later claim takes it again.
func (s *retryService) publish(ctx context.Context, msg domain.ClaimedMessage, ttl time.Duration) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}
	if err := s.publisher.Publish(ctx, payload, mq.WithExpiration(ttl)); err != nil {
		return fmt.Errorf("publish message: %w", err)
	}
	return nil
}

// messageTTL expires a queued message before its claim times out, so a
// re-claim can't leave a second copy in the queue.
func messageTTL(claimTimeoutSecs int) time.Duration {
	ttl := time.Duration(claimTimeoutSecs)*time.Second - TTL_MARGIN
	if ttl < MIN_TTL {
		return MIN_TTL
	}
	return ttl
}
