package gsm

import (
	"context"
	"time"

	"go.uber.org/zap"
)

const healthCheckInterval = 30 * time.Second

// StartHealthCheck runs a background goroutine that pings each module every 30s.
func (p *Pool) StartHealthCheck(ctx context.Context, log *zap.Logger) {
	go func() {
		ticker := time.NewTicker(healthCheckInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p.checkAll(log)
			}
		}
	}()
}

func (p *Pool) checkAll(log *zap.Logger) {
	for _, m := range p.modules {
		go func(mod *Module) {
			mod.mu.Lock()
			if mod.Status == StatusBusy {
				mod.mu.Unlock()
				return
			}
			mod.mu.Unlock()

			if err := mod.device.Ping(); err != nil {
				mod.mu.Lock()
				mod.Status = StatusOffline
				mod.mu.Unlock()
				log.Warn("gsm module offline", zap.String("port", mod.Port), zap.Error(err))
				return
			}

			registered, err := mod.device.NetworkRegistered()
			if err != nil || !registered {
				mod.mu.Lock()
				mod.Status = StatusError
				mod.mu.Unlock()
				log.Warn("gsm module not registered on network", zap.String("port", mod.Port))
				return
			}

			mod.mu.Lock()
			if mod.Status == StatusOffline || mod.Status == StatusError {
				mod.Status = StatusIdle
				log.Info("gsm module recovered", zap.String("port", mod.Port))
			}
			mod.mu.Unlock()
		}(m)
	}
}
