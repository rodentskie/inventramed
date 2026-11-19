package main

import (
	"context"
	"errors"
	"io/fs"
	"libs/go/mq"
	"os"
	"os/signal"
	"syscall"
	"time"

	"apps/worker/internal/api"
	retryservice "apps/worker/internal/service/retry"

	"github.com/joho/godotenv"
	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
)

const (
	HTTP_TIMEOUT    = 30 * time.Second
	EXIT_OK         = 0
	EXIT_CONN_ERROR = 1
)

type config struct {
	AppURL       string
	APIToken     string
	RabbitMQURL  string
	PollInterval time.Duration
}

func loadConfig() config {
	interval, err := time.ParseDuration(env.GetEnv("WORKER_POLL_INTERVAL", "30s"))
	if err != nil {
		interval = 30 * time.Second
	}
	return config{
		AppURL:       env.GetEnv("APP_URL", ""),
		APIToken:     env.GetEnv("WORKER_API_TOKEN", ""),
		RabbitMQURL:  env.GetEnv("RABBITMQ_URL", ""),
		PollInterval: interval,
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
	if cfg.AppURL == "" || cfg.APIToken == "" || cfg.RabbitMQURL == "" {
		log.Fatal("APP_URL, WORKER_API_TOKEN and RABBITMQ_URL are required")
	}

	publisher, err := mq.NewPublisher(cfg.RabbitMQURL, mq.QueueName)
	if err != nil {
		log.Fatal("failed to connect to rabbitmq", zap.Error(err))
	}
	defer publisher.Close() //nolint:errcheck

	client := api.New(cfg.AppURL, cfg.APIToken, HTTP_TIMEOUT)
	svc := retryservice.New(client, publisher, log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		poll(ctx, log, svc, cfg.PollInterval)
	}()

	log.Info("retry worker started", zap.Duration("poll_interval", cfg.PollInterval))
	code := waitForStop(log, publisher)

	log.Info("retry worker stopping")
	cancel()
	<-done
	return code
}

// poll runs immediately, then waits the interval from the last claim, or the
// fallback when no claim was made.
func poll(ctx context.Context, log *zap.Logger, svc retryservice.RetryService, fallback time.Duration) {
	timer := time.NewTimer(0)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		next, err := svc.Run(ctx)
		if err != nil {
			log.Error("retry run failed", zap.Error(err))
		}
		if next <= 0 {
			next = fallback
		}
		timer.Reset(next)
	}
}

func waitForStop(log *zap.Logger, publisher *mq.Publisher) int {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-quit:
		return EXIT_OK
	case err := <-publisher.Closed():
		log.Error("mq publisher connection closed", zap.Error(err))
		return EXIT_CONN_ERROR
	}
}
