package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"apps/consumer/internal/domain"
	internalgsm "apps/consumer/internal/gsm"
	service "apps/consumer/internal/service/message"
	"libs/go/mq"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

type fakeSender struct {
	ref   string
	err   error
	calls int
}

func (f *fakeSender) Send(_, _ string) (string, error) {
	f.calls++
	return f.ref, f.err
}

type fakePublisher struct {
	published [][]byte
	err       error
}

func (f *fakePublisher) Publish(_ context.Context, body []byte, _ ...mq.PublishOption) error {
	f.published = append(f.published, body)
	return f.err
}

type ackRecord struct {
	acked   bool
	nacked  bool
	requeue bool
}

type fakeAcknowledger struct {
	mu  sync.Mutex
	rec ackRecord
}

func (f *fakeAcknowledger) Ack(_ uint64, _ bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rec.acked = true
	return nil
}

func (f *fakeAcknowledger) Nack(_ uint64, _ bool, requeue bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rec.nacked = true
	f.rec.requeue = requeue
	return nil
}

func (f *fakeAcknowledger) Reject(_ uint64, requeue bool) error {
	return f.Nack(0, false, requeue)
}

func eventBody(t *testing.T, body string) []byte {
	t.Helper()
	raw, err := json.Marshal(domain.MessageEvent{ID: "msg-1", PhoneNumber: "+639171234567", Body: body, Attempt: 2})
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	return raw
}

func TestMessageService_Handle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		body       []byte
		smsBody    string
		sender     fakeSender
		publishErr error
		wantErr    bool
		wantSends  int
		wantAck    ackRecord
		wantResult *domain.SendResult
	}{
		{
			name:       "reports success with the modem ref",
			smsBody:    "InventraMed expiry alert",
			sender:     fakeSender{ref: "+CMGS: 12"},
			wantSends:  1,
			wantAck:    ackRecord{acked: true},
			wantResult: &domain.SendResult{ID: "msg-1", Attempt: 2, Success: true, ModemResponse: "+CMGS: 12"},
		},
		{
			name:       "reports a send failure",
			smsBody:    "InventraMed expiry alert",
			sender:     fakeSender{err: errors.New("+CMS ERROR: 500")},
			wantSends:  1,
			wantAck:    ackRecord{acked: true},
			wantResult: &domain.SendResult{ID: "msg-1", Attempt: 2, Error: "+CMS ERROR: 500"},
		},
		{
			name:      "requeues when no module is idle",
			smsBody:   "InventraMed expiry alert",
			sender:    fakeSender{err: internalgsm.ErrNoIdleModule},
			wantSends: 1,
			wantAck:   ackRecord{nacked: true, requeue: true},
		},
		{
			name:       "rejects a body longer than one SMS",
			smsBody:    strings.Repeat("a", 161),
			wantAck:    ackRecord{acked: true},
			wantResult: &domain.SendResult{ID: "msg-1", Attempt: 2, Error: "body is not a single GSM-7 SMS (161 chars)"},
		},
		{
			name:       "rejects a body outside GSM-7",
			smsBody:    "Paracetamol 💊",
			wantAck:    ackRecord{acked: true},
			wantResult: &domain.SendResult{ID: "msg-1", Attempt: 2, Error: "body contains characters outside GSM-7"},
		},
		{
			name:       "rejects control characters",
			smsBody:    "alert\x1A",
			wantAck:    ackRecord{acked: true},
			wantResult: &domain.SendResult{ID: "msg-1", Attempt: 2, Error: "body contains control characters"},
		},
		{
			name:    "drops invalid json",
			body:    []byte("{"),
			wantErr: true,
			wantAck: ackRecord{nacked: true},
		},
		{
			name:       "requeues when the result can't be published",
			smsBody:    "InventraMed expiry alert",
			sender:     fakeSender{ref: "+CMGS: 12"},
			publishErr: errors.New("channel closed"),
			wantErr:    true,
			wantSends:  1,
			wantAck:    ackRecord{nacked: true, requeue: true},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			body := tc.body
			if body == nil {
				body = eventBody(t, tc.smsBody)
			}
			sender := tc.sender
			pub := &fakePublisher{err: tc.publishErr}
			ack := &fakeAcknowledger{}
			svc := service.New(&sender, pub, zap.NewNop(), 0)

			err := svc.Handle(context.Background(), amqp.Delivery{Acknowledger: ack, Body: body})

			if (err != nil) != tc.wantErr {
				t.Fatalf("Handle() error = %v, wantErr %v", err, tc.wantErr)
			}
			if sender.calls != tc.wantSends {
				t.Errorf("sends = %d, want %d", sender.calls, tc.wantSends)
			}
			if ack.rec != tc.wantAck {
				t.Errorf("ack = %+v, want %+v", ack.rec, tc.wantAck)
			}
			assertResult(t, pub, tc.wantResult)
		})
	}
}

func assertResult(t *testing.T, pub *fakePublisher, want *domain.SendResult) {
	t.Helper()
	if want == nil {
		return
	}
	if len(pub.published) != 1 {
		t.Fatalf("published %d results, want 1", len(pub.published))
	}
	var got domain.SendResult
	if err := json.Unmarshal(pub.published[0], &got); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if got != *want {
		t.Errorf("result = %+v, want %+v", got, *want)
	}
}
