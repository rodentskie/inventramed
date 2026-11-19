package retry_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"apps/worker/internal/domain"
	"apps/worker/internal/service/retry"
	"libs/go/mq"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

type fakeClaimer struct {
	claim  domain.Claim
	err    error
	called bool
}

func (f *fakeClaimer) Claim(_ context.Context) (domain.Claim, error) {
	f.called = true
	return f.claim, f.err
}

type published struct {
	msg        domain.ClaimedMessage
	expiration string
}

type fakePublisher struct {
	consumers int
	countErr  error
	failIDs   map[string]bool
	published []published
}

func (f *fakePublisher) Publish(_ context.Context, body []byte, opts ...mq.PublishOption) error {
	var msg domain.ClaimedMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return err
	}
	if f.failIDs[msg.ID] {
		return errors.New("channel closed")
	}
	var p amqp.Publishing
	for _, opt := range opts {
		opt(&p)
	}
	f.published = append(f.published, published{msg: msg, expiration: p.Expiration})
	return nil
}

func (f *fakePublisher) ConsumerCount() (int, error) {
	return f.consumers, f.countErr
}

func messages(ids ...string) []domain.ClaimedMessage {
	out := make([]domain.ClaimedMessage, len(ids))
	for i, id := range ids {
		out[i] = domain.ClaimedMessage{ID: id, PhoneNumber: "+639171234567", Body: "alert", Attempt: 1}
	}
	return out
}

func TestRetryService_Run(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		consumers      int
		countErr       error
		claim          domain.Claim
		claimErr       error
		failIDs        map[string]bool
		wantErr        bool
		wantClaimed    bool
		wantPublished  []string
		wantExpiration string
		wantInterval   time.Duration
	}{
		{
			name:           "publishes each message with the ttl",
			consumers:      1,
			claim:          domain.Claim{PollIntervalSecs: 300, ClaimTimeoutSecs: 600, Messages: messages("a", "b")},
			wantClaimed:    true,
			wantPublished:  []string{"a", "b"},
			wantExpiration: "540000",
			wantInterval:   300 * time.Second,
		},
		{
			name:           "uses the minimum ttl for a short claim timeout",
			consumers:      1,
			claim:          domain.Claim{PollIntervalSecs: 60, ClaimTimeoutSecs: 60, Messages: messages("a")},
			wantClaimed:    true,
			wantPublished:  []string{"a"},
			wantExpiration: "30000",
			wantInterval:   60 * time.Second,
		},
		{
			name:      "skips the claim with no consumers",
			consumers: 0,
		},
		{
			name:     "consumer count error",
			countErr: errors.New("channel closed"),
			wantErr:  true,
		},
		{
			name:        "claim error",
			consumers:   1,
			claimErr:    errors.New("status 500"),
			wantErr:     true,
			wantClaimed: true,
		},
		{
			name:           "one failed publish doesn't stop the rest",
			consumers:      1,
			claim:          domain.Claim{PollIntervalSecs: 300, ClaimTimeoutSecs: 600, Messages: messages("a", "b", "c")},
			failIDs:        map[string]bool{"b": true},
			wantClaimed:    true,
			wantPublished:  []string{"a", "c"},
			wantExpiration: "540000",
			wantInterval:   300 * time.Second,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			claimer := &fakeClaimer{claim: tc.claim, err: tc.claimErr}
			pub := &fakePublisher{consumers: tc.consumers, countErr: tc.countErr, failIDs: tc.failIDs}
			svc := retry.New(claimer, pub, zap.NewNop())

			interval, err := svc.Run(context.Background())

			if (err != nil) != tc.wantErr {
				t.Fatalf("Run() error = %v, wantErr %v", err, tc.wantErr)
			}
			if claimer.called != tc.wantClaimed {
				t.Errorf("claimed = %v, want %v", claimer.called, tc.wantClaimed)
			}
			if interval != tc.wantInterval {
				t.Errorf("interval = %v, want %v", interval, tc.wantInterval)
			}
			assertPublished(t, pub.published, tc.wantPublished, tc.wantExpiration)
		})
	}
}

func assertPublished(t *testing.T, got []published, wantIDs []string, wantExpiration string) {
	t.Helper()
	if len(got) != len(wantIDs) {
		t.Fatalf("published %d messages, want %d", len(got), len(wantIDs))
	}
	for i, p := range got {
		if p.msg.ID != wantIDs[i] || p.expiration != wantExpiration {
			t.Errorf("published[%d] = %+v, want id %q expiration %q", i, p, wantIDs[i], wantExpiration)
		}
	}
}
