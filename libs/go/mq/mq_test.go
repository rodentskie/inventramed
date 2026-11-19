package mq

import (
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestWithExpiration(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		ttl  time.Duration
		want string
	}{
		{name: "minutes", ttl: 9 * time.Minute, want: "540000"},
		{name: "seconds", ttl: 30 * time.Second, want: "30000"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var msg amqp.Publishing
			WithExpiration(tc.ttl)(&msg)

			if msg.Expiration != tc.want {
				t.Errorf("Expiration = %q, want %q", msg.Expiration, tc.want)
			}
		})
	}
}
