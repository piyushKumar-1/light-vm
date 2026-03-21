package storage

import (
	"context"
	"time"
)

// Sample represents a single time-series data point.
type Sample struct {
	MetricName string
	Labels     map[string]string
	Value      float64
	Timestamp  time.Time
	MetricType string // counter, gauge, histogram_bucket
}

// QueryParams defines parameters for a time-series range query.
type QueryParams struct {
	MetricName string
	LabelMatch map[string]string // exact match; prefix value with ~ for regex
	Target     string            // __target__ label value, "*" for all
	Start      time.Time
	End        time.Time
	Step       time.Duration // if > 0, downsample by averaging over step-sized buckets
}

// TimeSeries is a query result: a labeled set of ordered data points.
type TimeSeries struct {
	Labels     map[string]string `json:"labels"`
	Datapoints [][2]float64      `json:"datapoints"` // [timestamp_unix_seconds, value]
}

// MetricMeta describes a known metric.
type MetricMeta struct {
	Name       string   `json:"name"`
	Type       string   `json:"type"`
	Target     string   `json:"target"`
	LabelNames []string `json:"label_names"`
}

// Storage is the interface for the time-series storage backend.
type Storage interface {
	WriteSamples(ctx context.Context, samples []Sample) error
	QueryRange(ctx context.Context, params QueryParams) ([]TimeSeries, error)
	ListMetrics(ctx context.Context, target string) ([]MetricMeta, error)
	LabelValues(ctx context.Context, metricName, target, labelName string) ([]string, error)
	Prune(ctx context.Context, olderThan time.Time) (int64, error)
	PruneTarget(ctx context.Context, target string, olderThan time.Time) (int64, error)
	Close() error
}
