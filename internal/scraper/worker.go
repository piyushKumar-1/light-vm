package scraper

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/piyushkumar-1/light_vm/internal/config"
	"github.com/piyushkumar-1/light_vm/internal/storage"
)

// TargetStatus holds the health state of a scrape target.
type TargetStatus struct {
	Name       string    `json:"name"`
	URL        string    `json:"url"`
	Health     string    `json:"health"`
	LastScrape time.Time `json:"last_scrape"`
	LastError  string    `json:"last_error,omitempty"`
	ScrapeDur  float64   `json:"scrape_duration_seconds"`
}

// Worker scrapes a single Prometheus target on a timer.
type Worker struct {
	target   config.TargetConfig
	interval time.Duration
	timeout  time.Duration
	store    storage.Storage
	logger   *slog.Logger
	client   *http.Client

	mu     sync.RWMutex
	status TargetStatus
}

// Run starts the scrape loop. It blocks until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) {
	w.client = &http.Client{Timeout: w.timeout}
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	w.scrape(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.scrape(ctx)
		}
	}
}

func (w *Worker) scrape(ctx context.Context) {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "GET", w.target.URL, nil)
	if err != nil {
		w.setError(err)
		return
	}
	req.Header.Set("Accept", "text/plain;version=0.0.4")

	resp, err := w.client.Do(req)
	elapsed := time.Since(start)

	w.mu.Lock()
	w.status.Name = w.target.Name
	w.status.URL = w.target.URL
	w.status.LastScrape = time.Now()
	w.status.ScrapeDur = elapsed.Seconds()
	w.mu.Unlock()

	if err != nil {
		w.setError(err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		w.setError(fmt.Errorf("HTTP %d", resp.StatusCode))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		w.setError(err)
		return
	}

	samples, err := Parse(body, w.target.Name, w.target.Labels)
	if err != nil {
		w.setError(err)
		return
	}

	if err := w.store.WriteSamples(ctx, samples); err != nil {
		w.setError(err)
		w.logger.Error("failed to write samples", "error", err)
		return
	}

	w.mu.Lock()
	w.status.Health = "up"
	w.status.LastError = ""
	w.mu.Unlock()
}

func (w *Worker) setError(err error) {
	w.mu.Lock()
	w.status.Health = "down"
	w.status.LastError = err.Error()
	w.mu.Unlock()
	w.logger.Error("scrape failed", "error", err)
}

// Status returns a snapshot of the target's health.
func (w *Worker) Status() TargetStatus {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.status
}
