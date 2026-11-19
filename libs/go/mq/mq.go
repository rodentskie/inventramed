package mq

import (
	"context"
	"fmt"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	QueueName    = "sms.send"
	QueueSuccess = "sms.success"
)

// Publisher publishes messages to a RabbitMQ queue.
type Publisher struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	queueName string
}

func NewPublisher(url, queueName string) (*Publisher, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("dial rabbitmq: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("open channel: %w", err)
	}

	_, err = ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("declare queue: %w", err)
	}

	return &Publisher{conn: conn, channel: ch, queueName: queueName}, nil
}

func (p *Publisher) Close() error {
	if err := p.channel.Close(); err != nil {
		return fmt.Errorf("close channel: %w", err)
	}
	if err := p.conn.Close(); err != nil {
		return fmt.Errorf("close connection: %w", err)
	}
	return nil
}

func (p *Publisher) Publish(ctx context.Context, body []byte) error {
	return p.channel.PublishWithContext(ctx, "", p.queueName, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})
}

// Consumer consumes messages from a RabbitMQ queue.
type Consumer struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	queueName string
}

func NewConsumer(url, queueName string) (*Consumer, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("dial rabbitmq: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("open channel: %w", err)
	}

	_, err = ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("declare queue: %w", err)
	}

	return &Consumer{conn: conn, channel: ch, queueName: queueName}, nil
}

func (c *Consumer) Consume(ctx context.Context) (<-chan amqp.Delivery, error) {
	deliveries, err := c.channel.ConsumeWithContext(ctx, c.queueName, "", false, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("consume queue %s: %w", c.queueName, err)
	}
	return deliveries, nil
}

func (c *Consumer) Close() error {
	if err := c.channel.Close(); err != nil {
		return fmt.Errorf("close channel: %w", err)
	}
	if err := c.conn.Close(); err != nil {
		return fmt.Errorf("close connection: %w", err)
	}
	return nil
}
