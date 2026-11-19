package gsm

import (
	"fmt"
	"sync"
	"time"

	libgsm "libs/go/gsm"
)

// ModuleStatus represents the current state of a GSM module.
type ModuleStatus string

const (
	StatusIdle    ModuleStatus = "idle"
	StatusBusy    ModuleStatus = "busy"
	StatusError   ModuleStatus = "error"
	StatusOffline ModuleStatus = "offline"
)

// Module represents a single GSM hardware module.
type Module struct {
	Port     string
	Status   ModuleStatus
	LastUsed time.Time
	device   *libgsm.Device
	mu       sync.Mutex
}

// newModule opens a serial connection and initializes the GSM module.
func newModule(port string) (*Module, error) {
	device, err := libgsm.NewDevice(port)
	if err != nil {
		return nil, fmt.Errorf("open device %s: %w", port, err)
	}

	if err := device.Initialize(); err != nil {
		device.Close()
		return nil, fmt.Errorf("initialize device %s: %w", port, err)
	}

	return &Module{
		Port:   port,
		Status: StatusIdle,
		device: device,
	}, nil
}

// sendSMS sends an SMS. The pool sets status to busy before calling this.
// This method updates status to idle or error after the attempt.
func (m *Module) sendSMS(number, body string) error {
	err := m.device.SendSMS(number, body)

	m.mu.Lock()
	m.LastUsed = time.Now()
	if err != nil {
		m.Status = StatusError
	} else {
		m.Status = StatusIdle
	}
	m.mu.Unlock()

	return err
}

func (m *Module) close() error {
	return m.device.Close()
}
