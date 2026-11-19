package main

import (
	"context"
	"libs/go/mq"
	"os"
	"os/signal"
	"syscall"
	"time"

	repository "apps/worker/internal/repository/message"
	retryservice "apps/worker/internal/service/retry"

	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type config struct {
	DatabaseURL  string
	RabbitMQURL  string
	PollInterval time.Duration
}

func loadConfig() config {
	interval, err := time.ParseDuration(env.GetEnv("WORKER_POLL_INTERVAL", "30s"))
	if err != nil {
		interval = 30 * time.Second
	}
	return config{
		DatabaseURL:  env.GetEnv("DATABASE_URL", ""),
		RabbitMQURL:  env.GetEnv("RABBITMQ_URL", ""),
		PollInterval: interval,
	}
}

func main() {
	log := logger.New()
	defer log.Sync() //nolint:errcheck

	cfg := loadConfig()

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if cfg.RabbitMQURL == "" {
		log.Fatal("RABBITMQ_URL is required")
	}

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect to database", zap.Error(err))
	}

	publisher, err := mq.NewPublisher(cfg.RabbitMQURL, mq.QueueName)
	if err != nil {
		log.Fatal("failed to connect to rabbitmq", zap.Error(err))
	}
	defer publisher.Close()

	repo := repository.New(db)
	svc := retryservice.New(repo, publisher, log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	log.Info("retry worker started", zap.Duration("poll_interval", cfg.PollInterval))

	go func() {
		for {
			select {
			case <-ticker.C:
				if err := svc.Run(ctx); err != nil {
					log.Error("retry run failed", zap.Error(err))
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("retry worker stopping")
	cancel()
}
