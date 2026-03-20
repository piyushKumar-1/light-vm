package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadValidConfig(t *testing.T) {
	content := `
global:
  scrape_interval: 10s
  scrape_timeout: 5s
  retention: 24h
  listen_address: ":8080"
storage:
  path: "/tmp/test.db"
targets:
  - name: "app"
    url: "http://localhost:9090/metrics"
dashboards:
  - name: "Test"
    refresh: 30s
    time_range: 1h
    panels:
      - title: "Memory"
        type: "timeseries"
        query:
          metric: "process_resident_memory_bytes"
          type: "gauge"
          target: "app"
        y_axis:
          unit: "bytes"
`
	path := filepath.Join(t.TempDir(), "test.yml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Global.ScrapeInterval.Duration != 10*time.Second {
		t.Errorf("scrape_interval: got %v, want 10s", cfg.Global.ScrapeInterval.Duration)
	}
	if cfg.Global.ListenAddress != ":8080" {
		t.Errorf("listen_address: got %q, want :8080", cfg.Global.ListenAddress)
	}
	if len(cfg.Targets) != 1 {
		t.Errorf("targets: got %d, want 1", len(cfg.Targets))
	}
	if len(cfg.Dashboards) != 1 {
		t.Errorf("dashboards: got %d, want 1", len(cfg.Dashboards))
	}
}

func TestLoadDefaults(t *testing.T) {
	content := `
targets:
  - name: "app"
    url: "http://localhost:9090/metrics"
`
	path := filepath.Join(t.TempDir(), "test.yml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Global.ScrapeInterval.Duration != 15*time.Second {
		t.Errorf("default scrape_interval: got %v, want 15s", cfg.Global.ScrapeInterval.Duration)
	}
	if cfg.Global.Retention.Duration != 72*time.Hour {
		t.Errorf("default retention: got %v, want 72h", cfg.Global.Retention.Duration)
	}
	if cfg.Global.ListenAddress != ":9090" {
		t.Errorf("default listen_address: got %q, want :9090", cfg.Global.ListenAddress)
	}
}

func TestLoadNoTargets(t *testing.T) {
	content := `
global:
  scrape_interval: 15s
`
	path := filepath.Join(t.TempDir(), "test.yml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for config with no targets")
	}
}

func TestLoadDuplicateTargetNames(t *testing.T) {
	content := `
targets:
  - name: "app"
    url: "http://localhost:9090/metrics"
  - name: "app"
    url: "http://localhost:9091/metrics"
`
	path := filepath.Join(t.TempDir(), "test.yml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for duplicate target names")
	}
}
