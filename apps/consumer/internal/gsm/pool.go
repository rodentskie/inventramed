package gsm

import (
	"fmt"
	"sync"
)

// Pool manages a set of GSM modules with round-robin selection.
type Pool struct {
	modules       []*Module
	lastUsedIndex int
	mu            sync.Mutex
}

// NewPool initializes a pool from the given serial port paths.
func NewPool(ports []string) (*Pool, error) {
	if len(ports) == 0 {
		return nil, fmt.Errorf("at least one port is required")
	}

	modules := make([]*Module, 0, len(ports))
	for _, port := range ports {
		mod, err := newModule(port)
		if err != nil {
			for _, m := range modules {
				m.close()
			}
			return nil, fmt.Errorf("init module %s: %w", port, err)
		}
		modules = append(modules, mod)
	}

	return &Pool{modules: modules, lastUsedIndex: -1}, nil
}

// Send routes an SMS to the next idle module using round-robin selection.
func (p *Pool) Send(number, body string) error {
	mod := p.nextIdle()
	if mod == nil {
		return fmt.Errorf("no idle gsm modules available")
	}
	return mod.sendSMS(number, body)
}

// Close closes all module connections.
func (p *Pool) Close() {
	for _, m := range p.modules {
		m.close()
	}
}

// nextIdle finds the next idle module starting from lastUsedIndex+1 and
// marks it busy atomically so no other goroutine can claim the same module.
func (p *Pool) nextIdle() *Module {
	p.mu.Lock()
	defer p.mu.Unlock()

	count := len(p.modules)
	for i := 0; i < count; i++ {
		idx := (p.lastUsedIndex + 1 + i) % count
		m := p.modules[idx]

		m.mu.Lock()
		if m.Status == StatusIdle {
			m.Status = StatusBusy
			p.lastUsedIndex = idx
			m.mu.Unlock()
			return m
		}
		m.mu.Unlock()
	}

	return nil
}
