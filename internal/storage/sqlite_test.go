package storage

import (
	"context"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *SQLiteStore {
	t.Helper()
	store, err := NewSQLiteStore(":memory:", true)
	if err != nil {
		t.Fatalf("NewSQLiteStore: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func TestWriteAndQuerySamples(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	now := time.Now()

	samples := []Sample{
		{
			MetricName: "test_gauge",
			Labels:     map[string]string{"__target__": "app", "env": "prod"},
			Value:      42.0,
			Timestamp:  now,
			MetricType: "gauge",
		},
		{
			MetricName: "test_gauge",
			Labels:     map[string]string{"__target__": "app", "env": "prod"},
			Value:      43.0,
			Timestamp:  now.Add(15 * time.Second),
			MetricType: "gauge",
		},
		{
			MetricName: "test_gauge",
			Labels:     map[string]string{"__target__": "worker", "env": "prod"},
			Value:      10.0,
			Timestamp:  now,
			MetricType: "gauge",
		},
	}

	if err := store.WriteSamples(ctx, samples); err != nil {
		t.Fatalf("WriteSamples: %v", err)
	}

	// Query all targets
	series, err := store.QueryRange(ctx, QueryParams{
		MetricName: "test_gauge",
		Target:     "*",
		Start:      now.Add(-1 * time.Minute),
		End:        now.Add(1 * time.Minute),
	})
	if err != nil {
		t.Fatalf("QueryRange: %v", err)
	}
	if len(series) != 2 {
		t.Errorf("expected 2 series (two distinct label sets), got %d", len(series))
	}

	// Query specific target
	series, err = store.QueryRange(ctx, QueryParams{
		MetricName: "test_gauge",
		Target:     "app",
		Start:      now.Add(-1 * time.Minute),
		End:        now.Add(1 * time.Minute),
	})
	if err != nil {
		t.Fatalf("QueryRange: %v", err)
	}
	if len(series) != 1 {
		t.Errorf("expected 1 series for target=app, got %d", len(series))
	}
	if len(series) > 0 && len(series[0].Datapoints) != 2 {
		t.Errorf("expected 2 datapoints, got %d", len(series[0].Datapoints))
	}
}

func TestListMetrics(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	samples := []Sample{
		{
			MetricName: "metric_a",
			Labels:     map[string]string{"__target__": "app"},
			Value:      1,
			Timestamp:  time.Now(),
			MetricType: "gauge",
		},
		{
			MetricName: "metric_b",
			Labels:     map[string]string{"__target__": "app"},
			Value:      2,
			Timestamp:  time.Now(),
			MetricType: "counter",
		},
	}
	if err := store.WriteSamples(ctx, samples); err != nil {
		t.Fatalf("WriteSamples: %v", err)
	}

	metas, err := store.ListMetrics(ctx, "")
	if err != nil {
		t.Fatalf("ListMetrics: %v", err)
	}
	if len(metas) != 2 {
		t.Errorf("expected 2 metric metas, got %d", len(metas))
	}
}

func TestPrune(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	old := time.Now().Add(-48 * time.Hour)
	recent := time.Now()

	samples := []Sample{
		{
			MetricName: "m",
			Labels:     map[string]string{"__target__": "a"},
			Value:      1,
			Timestamp:  old,
			MetricType: "gauge",
		},
		{
			MetricName: "m",
			Labels:     map[string]string{"__target__": "a"},
			Value:      2,
			Timestamp:  recent,
			MetricType: "gauge",
		},
	}
	if err := store.WriteSamples(ctx, samples); err != nil {
		t.Fatalf("WriteSamples: %v", err)
	}

	deleted, err := store.Prune(ctx, time.Now().Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}
	if deleted != 1 {
		t.Errorf("expected 1 deleted, got %d", deleted)
	}

	series, err := store.QueryRange(ctx, QueryParams{
		MetricName: "m",
		Target:     "*",
		Start:      old.Add(-time.Hour),
		End:        recent.Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("QueryRange: %v", err)
	}
	total := 0
	for _, s := range series {
		total += len(s.Datapoints)
	}
	if total != 1 {
		t.Errorf("expected 1 remaining datapoint, got %d", total)
	}
}

func TestLabelMatchRegex(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	now := time.Now()

	samples := []Sample{
		{
			MetricName: "http_req",
			Labels:     map[string]string{"__target__": "app", "handler": "/api/v1/users"},
			Value:      1,
			Timestamp:  now,
			MetricType: "counter",
		},
		{
			MetricName: "http_req",
			Labels:     map[string]string{"__target__": "app", "handler": "/api/v2/orders"},
			Value:      2,
			Timestamp:  now,
			MetricType: "counter",
		},
		{
			MetricName: "http_req",
			Labels:     map[string]string{"__target__": "app", "handler": "/health"},
			Value:      3,
			Timestamp:  now,
			MetricType: "counter",
		},
	}
	if err := store.WriteSamples(ctx, samples); err != nil {
		t.Fatalf("WriteSamples: %v", err)
	}

	series, err := store.QueryRange(ctx, QueryParams{
		MetricName: "http_req",
		Target:     "*",
		LabelMatch: map[string]string{"handler": "~/api/.*"},
		Start:      now.Add(-time.Minute),
		End:        now.Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("QueryRange: %v", err)
	}
	if len(series) != 2 {
		t.Errorf("expected 2 series matching /api/.*, got %d", len(series))
	}
}
