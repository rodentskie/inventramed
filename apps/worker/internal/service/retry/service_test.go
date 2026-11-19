package retry_test

import (
	"context"
	"errors"
	"testing"

	"apps/worker/internal/domain"
	repository "apps/worker/internal/repository/message"
	"apps/worker/internal/service/retry"

	"go.uber.org/zap"
)

type mockRepo struct {
	settings       *domain.Settings
	settingsErr    error
	failedMsgs     []domain.Message
	failedMsgsErr  error
	updatedStatus  map[string]string
	updateErr      error
	incrementedIDs []string
	incrementErr   error
}

func (m *mockRepo) GetSettings(_ context.Context) (*domain.Settings, error) {
	return m.settings, m.settingsErr
}

func (m *mockRepo) GetFailedMessages(_ context.Context, _ int) ([]domain.Message, error) {
	return m.failedMsgs, m.failedMsgsErr
}

func (m *mockRepo) UpdateStatus(_ context.Context, id, status string) error {
	if m.updatedStatus == nil {
		m.updatedStatus = make(map[string]string)
	}
	m.updatedStatus[id] = status
	return m.updateErr
}

func (m *mockRepo) IncrementRetryCount(_ context.Context, id string) error {
	m.incrementedIDs = append(m.incrementedIDs, id)
	return m.incrementErr
}

type mockPublisher struct {
	published [][]byte
	err       error
}

func (m *mockPublisher) Publish(_ context.Context, body []byte) error {
	m.published = append(m.published, body)
	return m.err
}

var _ repository.MessageRepository = (*mockRepo)(nil)
var _ retry.Publisher = (*mockPublisher)(nil)

func TestRetryService_Run(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		settings      *domain.Settings
		settingsErr   error
		failedMsgs    []domain.Message
		wantErr       bool
		wantExhausted []string
		wantRequeued  []string
	}{
		{
			name:     "exhausts message at retry limit",
			settings: &domain.Settings{RetryLimit: 3, RetryWindowDays: 5},
			failedMsgs: []domain.Message{
				{ID: "abc", To: "+1234", Body: "test", RetryCount: 3},
			},
			wantExhausted: []string{"abc"},
			wantRequeued:  nil,
		},
		{
			name:     "requeues eligible message",
			settings: &domain.Settings{RetryLimit: 3, RetryWindowDays: 5},
			failedMsgs: []domain.Message{
				{ID: "abc", To: "+1234", Body: "hello", RetryCount: 1},
			},
			wantExhausted: nil,
			wantRequeued:  []string{"abc"},
		},
		{
			name:     "exhausts at limit boundary (count equals limit)",
			settings: &domain.Settings{RetryLimit: 3, RetryWindowDays: 5},
			failedMsgs: []domain.Message{
				{ID: "abc", To: "+1234", Body: "test", RetryCount: 3},
				{ID: "def", To: "+5678", Body: "test", RetryCount: 2},
			},
			wantExhausted: []string{"abc"},
			wantRequeued:  []string{"def"},
		},
		{
			name:        "settings fetch error",
			settingsErr: errors.New("db down"),
			wantErr:     true,
		},
		{
			name:          "no failed messages",
			settings:      &domain.Settings{RetryLimit: 3, RetryWindowDays: 5},
			failedMsgs:    []domain.Message{},
			wantExhausted: nil,
			wantRequeued:  nil,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			repo := &mockRepo{
				settings:    tc.settings,
				settingsErr: tc.settingsErr,
				failedMsgs:  tc.failedMsgs,
			}
			pub := &mockPublisher{}
			svc := retry.New(repo, pub, zap.NewNop())

			err := svc.Run(context.Background())

			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			for _, id := range tc.wantExhausted {
				if repo.updatedStatus[id] != "exhausted" {
					t.Errorf("message %q: expected status exhausted, got %q", id, repo.updatedStatus[id])
				}
			}

			if len(repo.incrementedIDs) != len(tc.wantRequeued) {
				t.Errorf("incremented %d IDs, want %d", len(repo.incrementedIDs), len(tc.wantRequeued))
			}
			if len(pub.published) != len(tc.wantRequeued) {
				t.Errorf("published %d messages, want %d", len(pub.published), len(tc.wantRequeued))
			}
		})
	}
}
