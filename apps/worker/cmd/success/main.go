package main

import (
	"context"
	"libs/go/mq"
	"os"
	"os/signal"
	"syscall"

	repository "apps/worker/internal/repository/message"
	successservice "apps/worker/internal/service/success"

	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type config struct {
	DatabaseURL string
	RabbitMQURL string
}

func loadConfig() config {
	return config{
		DatabaseURL: env.GetEnv("DATABASE_URL", ""),
		RabbitMQURL: env.GetEnv("RABBITMQ_URL", ""),
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

	consumer, err := mq.NewConsumer(cfg.RabbitMQURL, mq.QueueSuccess)
	if err != nil {
		log.Fatal("failed to connect mq consumer", zap.Error(err))
	}
	defer consumer.Close()

	repo := repository.New(db)
	svc := successservice.New(repo, log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	deliveries, err := consumer.Consume(ctx)
	if err != nil {
		log.Fatal("failed to start consuming", zap.Error(err))
	}

	log.Info("success worker started")

	go func() {
		for delivery := range deliveries {
			if err := svc.Handle(ctx, delivery); err != nil {
				log.Error("failed to handle delivery", zap.Error(err))
			}
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("success worker stopping")
	cancel()
}
