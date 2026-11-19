package main

import (
	"context"
	"libs/go/mq"
	"os"
	"os/signal"
	"syscall"
	"time"

	"apps/worker/internal/api"
	successservice "apps/worker/internal/service/success"

	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
)

const (
	PREFETCH        = 1
	HTTP_TIMEOUT    = 30 * time.Second
	REQUEUE_DELAY   = 5 * time.Second
	SHUTDOWN_GRACE  = 60 * time.Second
	EXIT_OK         = 0
	EXIT_CONN_ERROR = 1
)

type config struct {
	AppURL      string
	APIToken    string
	RabbitMQURL string
}

func loadConfig() config {
	return config{
		AppURL:      env.GetEnv("APP_URL", ""),
		APIToken:    env.GetEnv("WORKER_API_TOKEN", ""),
		RabbitMQURL: env.GetEnv("RABBITMQ_URL", ""),
	}
}

func main() {
	os.Exit(run())
}

// run returns the exit code, so deferred cleanup runs before os.Exit.
func run() int {
	log := logger.New()
	defer log.Sync() //nolint:errcheck

	cfg := loadConfig()
	if cfg.AppURL == "" || cfg.APIToken == "" || cfg.RabbitMQURL == "" {
		log.Fatal("APP_URL, WORKER_API_TOKEN and RABBITMQ_URL are required")
	}

	consumer, err := mq.NewConsumer(cfg.RabbitMQURL, mq.QueueSuccess, PREFETCH)
	if err != nil {
		log.Fatal("failed to connect mq consumer", zap.Error(err))
	}
	defer consumer.Close() //nolint:errcheck

	client := api.New(cfg.AppURL, cfg.APIToken, HTTP_TIMEOUT)
	svc := successservice.New(client, log, REQUEUE_DELAY)
	return consume(log, consumer, svc)
}

// consume handles deliveries until a signal or a closed connection, then
// waits for the result in flight before returning.
func consume(log *zap.Logger, consumer *mq.Consumer, svc successservice.SuccessService) int {
	consumeCtx, stopConsuming := context.WithCancel(context.Background())
	defer stopConsuming()

	deliveries, err := consumer.Consume(consumeCtx)
	if err != nil {
		log.Fatal("failed to start consuming", zap.Error(err))
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		// Not consumeCtx: a result already being reported should finish.
		for delivery := range deliveries {
			if err := svc.Handle(context.Background(), delivery); err != nil {
				log.Error("failed to handle delivery", zap.Error(err))
			}
		}
	}()

	log.Info("success worker started")
	code := waitForStop(log, consumer, done)

	log.Info("success worker stopping")
	stopConsuming()
	select {
	case <-done:
	case <-time.After(SHUTDOWN_GRACE):
		log.Warn("result still in flight after shutdown grace period")
	}
	return code
}

func waitForStop(log *zap.Logger, consumer *mq.Consumer, done <-chan struct{}) int {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-quit:
		return EXIT_OK
	case err := <-consumer.Closed():
		log.Error("mq consumer connection closed", zap.Error(err))
	case <-done:
		log.Error("delivery channel closed by the broker")
	}
	return EXIT_CONN_ERROR
}
