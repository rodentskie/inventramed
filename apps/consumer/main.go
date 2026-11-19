package main

import (
	"context"
	"libs/go/mq"
	"os"
	"os/signal"
	"strings"
	"syscall"

	internalgms "apps/consumer/internal/gsm"
	service "apps/consumer/internal/service/message"

	"github.com/rodentskiedev/go-libraries/lib/env"
	"github.com/rodentskiedev/go-libraries/lib/logger"
	"go.uber.org/zap"
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
	log := logger.New()
	defer log.Sync() //nolint:errcheck

	cfg := loadConfig()

	if cfg.RabbitMQURL == "" {
		log.Fatal("RABBITMQ_URL is required")
	}
	if len(cfg.GSMPorts) == 0 {
		log.Fatal("GSM_PORTS is required")
	}

	pool, err := internalgms.NewPool(cfg.GSMPorts)
	if err != nil {
		log.Fatal("failed to init gsm pool", zap.Error(err))
	}
	defer pool.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool.StartHealthCheck(ctx, log)

	consumer, err := mq.NewConsumer(cfg.RabbitMQURL, mq.QueueName)
	if err != nil {
		log.Fatal("failed to connect mq consumer", zap.Error(err))
	}
	defer consumer.Close()

	publisher, err := mq.NewPublisher(cfg.RabbitMQURL, mq.QueueSuccess)
	if err != nil {
		log.Fatal("failed to connect mq publisher", zap.Error(err))
	}
	defer publisher.Close()

	svc := service.New(pool, publisher, log)

	deliveries, err := consumer.Consume(ctx)
	if err != nil {
		log.Fatal("failed to start consuming", zap.Error(err))
	}

	log.Info("consumer started")

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

	log.Info("consumer stopping")
	cancel()
}
