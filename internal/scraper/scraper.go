package scraper

import (
	"context"
	"log/slog"
	"sync"

	"github.com/piyushkumar-1/light_vm/internal/config"
	"github.com/piyushkumar-1/light_vm/internal/storage"
)

// Manager owns the lifecycle of all scrape workers.
type Manager struct {
	cfg     *config.Config
	store   storage.Storage
	workers []*Worker
	logger  *slog.Logger
}

// NewManager creates a scrape manager for the given configuration.
func NewManager(cfg *config.Config, store storage.Storage, logger *slog.Logger) *Manager {
	return &Manager{cfg: cfg, store: store, logger: logger}
}

// Start launches one goroutine per target and blocks until ctx is cancelled.
func (m *Manager) Start(ctx context.Context) {
	var wg sync.WaitGroup
	for _, target := range m.cfg.Targets {
		interval := target.ScrapeInterval.Duration
		if interval == 0 {
			interval = m.cfg.Global.ScrapeInterval.Duration
		}
		w := &Worker{
			target:   target,
			interval: interval,
			timeout:  m.cfg.Global.ScrapeTimeout.Duration,
			store:    m.store,
			logger:   m.logger.With("target", target.Name),
		}
		m.workers = append(m.workers, w)
		wg.Add(1)
		go func() {
			defer wg.Done()
			w.Run(ctx)
		}()
	}
	wg.Wait()
}

// TargetStatuses returns health info for all targets.
func (m *Manager) TargetStatuses() []TargetStatus {
	statuses := make([]TargetStatus, len(m.workers))
	for i, w := range m.workers {
		statuses[i] = w.Status()
	}
	return statuses
}
