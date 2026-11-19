package mq

import (
	"context"
	"fmt"
	"strconv"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	QueueName    = "sms.send"
	QueueSuccess = "sms.success"
)

// PublishOption changes a message before it is published.
type PublishOption func(*amqp.Publishing)

// WithExpiration drops the message from the queue if no consumer takes it within d.
func WithExpiration(d time.Duration) PublishOption {
	return func(p *amqp.Publishing) {
		p.Expiration = strconv.FormatInt(d.Milliseconds(), 10)
	}
}

// Publisher publishes messages to a RabbitMQ queue.
type Publisher struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	queueName string
	closed    <-chan *amqp.Error
}

func NewPublisher(url, queueName string) (*Publisher, error) {
	conn, ch, err := open(url, queueName)
	if err != nil {
		return nil, err
	}
	return &Publisher{conn: conn, channel: ch, queueName: queueName, closed: notifyClosed(conn, ch)}, nil
}

func (p *Publisher) Close() error {
	return closeAll(p.conn, p.channel)
}

// Closed receives once when the connection or channel closes. The error is nil on a graceful close.
func (p *Publisher) Closed() <-chan *amqp.Error {
	return p.closed
}

func (p *Publisher) Publish(ctx context.Context, body []byte, opts ...PublishOption) error {
	msg := amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	}
	for _, opt := range opts {
		opt(&msg)
	}
	return p.channel.PublishWithContext(ctx, "", p.queueName, false, false, msg)
}

// ConsumerCount returns how many consumers are attached to the publisher's queue.
// The queue is declared by NewPublisher, so the passive declare can't fail with 404.
func (p *Publisher) ConsumerCount() (int, error) {
	q, err := p.channel.QueueDeclarePassive(p.queueName, true, false, false, false, nil)
	if err != nil {
		return 0, fmt.Errorf("inspect queue %s: %w", p.queueName, err)
	}
	return q.Consumers, nil
}

// Consumer consumes messages from a RabbitMQ queue.
type Consumer struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	queueName string
	closed    <-chan *amqp.Error
}

// NewConsumer limits unacknowledged deliveries to prefetch, so the broker doesn't push the whole queue at once.
func NewConsumer(url, queueName string, prefetch int) (*Consumer, error) {
	conn, ch, err := open(url, queueName)
	if err != nil {
		return nil, err
	}

	if err := ch.Qos(prefetch, 0, false); err != nil {
		_ = closeAll(conn, ch)
		return nil, fmt.Errorf("set prefetch: %w", err)
	}

	return &Consumer{conn: conn, channel: ch, queueName: queueName, closed: notifyClosed(conn, ch)}, nil
}

// Consume returns the delivery channel. Cancelling ctx cancels the consumer and closes the channel.
func (c *Consumer) Consume(ctx context.Context) (<-chan amqp.Delivery, error) {
	deliveries, err := c.channel.ConsumeWithContext(ctx, c.queueName, "", false, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("consume queue %s: %w", c.queueName, err)
	}
	return deliveries, nil
}

// Closed receives once when the connection or channel closes. The error is nil on a graceful close.
func (c *Consumer) Closed() <-chan *amqp.Error {
	return c.closed
}

func (c *Consumer) Close() error {
	return closeAll(c.conn, c.channel)
}

func open(url, queueName string) (*amqp.Connection, *amqp.Channel, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, nil, fmt.Errorf("dial rabbitmq: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("open channel: %w", err)
	}

	if _, err := ch.QueueDeclare(queueName, true, false, false, false, nil); err != nil {
		_ = closeAll(conn, ch)
		return nil, nil, fmt.Errorf("declare queue: %w", err)
	}

	return conn, ch, nil
}

// notifyClosed merges the connection and channel close notifications. Both
// listeners are buffered and drained, because amqp091 sends to them synchronously.
func notifyClosed(conn *amqp.Connection, ch *amqp.Channel) <-chan *amqp.Error {
	connClosed := conn.NotifyClose(make(chan *amqp.Error, 1))
	chClosed := ch.NotifyClose(make(chan *amqp.Error, 1))
	out := make(chan *amqp.Error, 1)

	go func() {
		select {
		case err := <-connClosed:
			out <- err
		case err := <-chClosed:
			out <- err
		}
	}()

	return out
}

func closeAll(conn *amqp.Connection, ch *amqp.Channel) error {
	if err := ch.Close(); err != nil && !conn.IsClosed() {
		return fmt.Errorf("close channel: %w", err)
	}
	if err := conn.Close(); err != nil && err != amqp.ErrClosed {
		return fmt.Errorf("close connection: %w", err)
	}
	return nil
}
