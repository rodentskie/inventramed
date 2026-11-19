package repository

import (
	"context"
	"fmt"
	"time"

	"apps/worker/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MessageRepository interface {
	GetSettings(ctx context.Context) (*domain.Settings, error)
	GetFailedMessages(ctx context.Context, windowDays int) ([]domain.Message, error)
	UpdateStatus(ctx context.Context, id string, status string) error
	IncrementRetryCount(ctx context.Context, id string) error
}

type messageRecord struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	To         string    `gorm:"type:varchar(20);not null"`
	Body       string    `gorm:"type:text;not null"`
	Status     string    `gorm:"type:varchar(20);not null"`
	RetryCount int16     `gorm:"type:smallint;not null"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (messageRecord) TableName() string {
	return "messages"
}

type settingsRecord struct {
	ID              int16 `gorm:"type:smallint;primaryKey"`
	RetryLimit      int16 `gorm:"type:smallint;not null"`
	RetryWindowDays int16 `gorm:"type:smallint;not null"`
}

func (settingsRecord) TableName() string {
	return "settings"
}

type messageRepository struct {
	db *gorm.DB
}

func New(db *gorm.DB) MessageRepository {
	return &messageRepository{db: db}
}

func (r *messageRepository) GetSettings(ctx context.Context) (*domain.Settings, error) {
	var s settingsRecord
	if err := r.db.WithContext(ctx).First(&s).Error; err != nil {
		return nil, fmt.Errorf("get settings: %w", err)
	}
	return &domain.Settings{
		RetryLimit:      s.RetryLimit,
		RetryWindowDays: s.RetryWindowDays,
	}, nil
}

func (r *messageRepository) GetFailedMessages(ctx context.Context, windowDays int) ([]domain.Message, error) {
	since := time.Now().AddDate(0, 0, -windowDays)
	var rows []messageRecord
	err := r.db.WithContext(ctx).
		Where("status = ? AND created_at >= ?", "failed", since).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("get failed messages: %w", err)
	}
	msgs := make([]domain.Message, len(rows))
	for i, row := range rows {
		msgs[i] = domain.Message{
			ID:         row.ID.String(),
			To:         row.To,
			Body:       row.Body,
			Status:     row.Status,
			RetryCount: row.RetryCount,
		}
	}
	return msgs, nil
}

func (r *messageRepository) UpdateStatus(ctx context.Context, id string, status string) error {
	err := r.db.WithContext(ctx).
		Model(&messageRecord{}).
		Where("id = ?", id).
		Update("status", status).Error
	if err != nil {
		return fmt.Errorf("update status: %w", err)
	}
	return nil
}

func (r *messageRepository) IncrementRetryCount(ctx context.Context, id string) error {
	err := r.db.WithContext(ctx).
		Model(&messageRecord{}).
		Where("id = ?", id).
		UpdateColumn("retry_count", gorm.Expr("retry_count + 1")).Error
	if err != nil {
		return fmt.Errorf("increment retry count: %w", err)
	}
	return nil
}
