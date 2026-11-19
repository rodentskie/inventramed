package success_test

import (
	"context"
	"errors"
	"testing"

	"apps/worker/internal/api"
	"apps/worker/internal/domain"
	"apps/worker/internal/service/success"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

type fakeReporter struct {
	res    domain.ResultResponse
	err    error
	id     string
	input  domain.ResultInput
	called bool
}

func (f *fakeReporter) Result(_ context.Context, id string, input domain.ResultInput) (domain.ResultResponse, error) {
	f.called, f.id, f.input = true, id, input
	return f.res, f.err
}

type ackRecord struct {
	acked   bool
	nacked  bool
	requeue bool
}

type fakeAcknowledger struct {
	rec ackRecord
}

func (f *fakeAcknowledger) Ack(_ uint64, _ bool) error {
	f.rec.acked = true
	return nil
}

func (f *fakeAcknowledger) Nack(_ uint64, _ bool, requeue bool) error {
	f.rec.nacked, f.rec.requeue = true, requeue
	return nil
}

func (f *fakeAcknowledger) Reject(_ uint64, requeue bool) error {
	return f.Nack(0, false, requeue)
}

const resultBody = `{"id":"m1","attempt":2,"success":false,"error":"+CMS ERROR: 500"}`

func TestSuccessService_Handle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		body       string
		res        domain.ResultResponse
		err        error
		wantErr    bool
		wantCalled bool
		wantAck    ackRecord
	}{
		{name: "acks an applied result", body: resultBody, res: domain.ResultResponse{ID: "m1", Status: "PENDING", Applied: true}, wantCalled: true, wantAck: ackRecord{acked: true}},
		{name: "acks a stale result", body: resultBody, res: domain.ResultResponse{ID: "m1", Status: "SENT"}, wantCalled: true, wantAck: ackRecord{acked: true}},
		{name: "drops on 400", body: resultBody, err: &api.Error{StatusCode: 400}, wantErr: true, wantCalled: true, wantAck: ackRecord{nacked: true}},
		{name: "drops on 404", body: resultBody, err: &api.Error{StatusCode: 404}, wantErr: true, wantCalled: true, wantAck: ackRecord{nacked: true}},
		{name: "requeues on 401", body: resultBody, err: &api.Error{StatusCode: 401}, wantErr: true, wantCalled: true, wantAck: ackRecord{nacked: true, requeue: true}},
		{name: "requeues on 500", body: resultBody, err: &api.Error{StatusCode: 500}, wantErr: true, wantCalled: true, wantAck: ackRecord{nacked: true, requeue: true}},
		{name: "requeues on a network error", body: resultBody, err: errors.New("connection refused"), wantErr: true, wantCalled: true, wantAck: ackRecord{nacked: true, requeue: true}},
		{name: "drops invalid json", body: "{", wantErr: true, wantAck: ackRecord{nacked: true}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			reporter := &fakeReporter{res: tc.res, err: tc.err}
			ack := &fakeAcknowledger{}
			svc := success.New(reporter, zap.NewNop(), 0)

			err := svc.Handle(context.Background(), amqp.Delivery{Acknowledger: ack, Body: []byte(tc.body)})

			if (err != nil) != tc.wantErr {
				t.Fatalf("Handle() error = %v, wantErr %v", err, tc.wantErr)
			}
			if reporter.called != tc.wantCalled {
				t.Fatalf("reported = %v, want %v", reporter.called, tc.wantCalled)
			}
			if ack.rec != tc.wantAck {
				t.Errorf("ack = %+v, want %+v", ack.rec, tc.wantAck)
			}
			want := domain.ResultInput{Attempt: 2, Error: "+CMS ERROR: 500"}
			if tc.wantCalled && (reporter.id != "m1" || reporter.input != want) {
				t.Errorf("reported %q %+v, want m1 %+v", reporter.id, reporter.input, want)
			}
		})
	}
}
