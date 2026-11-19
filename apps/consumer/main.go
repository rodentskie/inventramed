package main

import (
	"context"
	"errors"
	"io/fs"
	"libs/go/mq"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	internalgsm "apps/consumer/internal/gsm"
	service "apps/consumer/internal/service/message"

	"github.com/joho/godotenv"
	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
)

const (
	PREFETCH        = 1
	REQUEUE_DELAY   = 5 * time.Second
	SHUTDOWN_GRACE  = 60 * time.Second
	EXIT_OK         = 0
	EXIT_CONN_ERROR = 1
)

type config struct {
	RabbitMQURL string
	GSMPorts    []string
}

func loadConfig() config {
	raw := env.GetEnv("GSM_PORTS", "")
	var ports []string
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			ports = append(ports, p)
		}
	}

	return config{
		RabbitMQURL: env.GetEnv("RABBITMQ_URL", ""),
		GSMPorts:    ports,
	}
}

func main() {
	os.Exit(run())
}

// run returns the exit code, so deferred cleanup runs before os.Exit.
func run() int {
	log := logger.New()
	defer log.Sync() //nolint:errcheck

	// Variables already set in the environment take precedence over .env.
	if err := godotenv.Load(); err != nil && !errors.Is(err, fs.ErrNotExist) {
		log.Fatal("failed to load .env", zap.Error(err))
	}

	cfg := loadConfig()
	if cfg.RabbitMQURL == "" {
		log.Fatal("RABBITMQ_URL is required")
	}
	if len(cfg.GSMPorts) == 0 {
		log.Fatal("GSM_PORTS is required")
	}

	pool, err := internalgsm.NewPool(cfg.GSMPorts)
	if err != nil {
		log.Fatal("failed to init gsm pool", zap.Error(err))
	}
	defer pool.Close()

	healthCtx, stopHealth := context.WithCancel(context.Background())
	defer stopHealth()
	pool.StartHealthCheck(healthCtx, log)

	consumer, err := mq.NewConsumer(cfg.RabbitMQURL, mq.QueueName, PREFETCH)
	if err != nil {
		log.Fatal("failed to connect mq consumer", zap.Error(err))
	}
	defer consumer.Close() //nolint:errcheck

	publisher, err := mq.NewPublisher(cfg.RabbitMQURL, mq.QueueSuccess)
	if err != nil {
		log.Fatal("failed to connect mq publisher", zap.Error(err))
	}
	defer publisher.Close() //nolint:errcheck

	svc := service.New(pool, publisher, log, REQUEUE_DELAY)
	return consume(log, consumer, publisher, svc)
}

// consume handles deliveries until a signal or a closed connection, then
// waits for the message in flight before returning.
func consume(log *zap.Logger, consumer *mq.Consumer, publisher *mq.Publisher, svc service.MessageService) int {
	consumeCtx, stopConsuming := context.WithCancel(context.Background())
	defer stopConsuming()

	deliveries, err := consumer.Consume(consumeCtx)
	if err != nil {
		log.Fatal("failed to start consuming", zap.Error(err))
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		// Not consumeCtx: a message already being sent should still report its result.
		for delivery := range deliveries {
			if err := svc.Handle(context.Background(), delivery); err != nil {
				log.Error("failed to handle delivery", zap.Error(err))
			}
		}
	}()

	log.Info("consumer started")
	code := waitForStop(log, consumer, publisher, done)

	log.Info("consumer stopping")
	stopConsuming()
	select {
	case <-done:
	case <-time.After(SHUTDOWN_GRACE):
		log.Warn("message still in flight after shutdown grace period")
	}
	return code
}

func waitForStop(log *zap.Logger, consumer *mq.Consumer, publisher *mq.Publisher, done <-chan struct{}) int {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-quit:
		return EXIT_OK
	case err := <-consumer.Closed():
		log.Error("mq consumer connection closed", zap.Error(err))
	case err := <-publisher.Closed():
		log.Error("mq publisher connection closed", zap.Error(err))
	case <-done:
		log.Error("delivery channel closed by the broker")
	}
	return EXIT_CONN_ERROR
}
