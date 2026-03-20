package scraper

import (
	"testing"
)

const sampleMetrics = `# HELP http_requests_total Total HTTP requests.
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234
http_requests_total{method="POST",status="201"} 56
# HELP go_goroutines Number of goroutines.
# TYPE go_goroutines gauge
go_goroutines 42
# HELP http_request_duration_seconds HTTP request duration.
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005"} 0
http_request_duration_seconds_bucket{le="0.01"} 10
http_request_duration_seconds_bucket{le="0.025"} 20
http_request_duration_seconds_bucket{le="0.05"} 35
http_request_duration_seconds_bucket{le="0.1"} 60
http_request_duration_seconds_bucket{le="0.25"} 80
http_request_duration_seconds_bucket{le="0.5"} 90
http_request_duration_seconds_bucket{le="1"} 95
http_request_duration_seconds_bucket{le="+Inf"} 100
http_request_duration_seconds_sum 15.5
http_request_duration_seconds_count 100
`

func TestParse(t *testing.T) {
	extraLabels := map[string]string{"env": "test"}
	samples, err := Parse([]byte(sampleMetrics), "my-app", extraLabels)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if len(samples) == 0 {
		t.Fatal("expected samples, got none")
	}

	// Check that we have the expected metric names
	metricNames := make(map[string]bool)
	for _, s := range samples {
		metricNames[s.MetricName] = true
	}

	expected := []string{
		"http_requests_total",
		"go_goroutines",
		"http_request_duration_seconds_bucket",
		"http_request_duration_seconds_count",
		"http_request_duration_seconds_sum",
		"http_request_duration_seconds", // pre-computed percentiles
	}
	for _, name := range expected {
		if !metricNames[name] {
			t.Errorf("missing metric %q", name)
		}
	}

	// Check labels
	for _, s := range samples {
		if s.Labels["__target__"] != "my-app" {
			t.Errorf("sample %s: expected __target__=my-app, got %s", s.MetricName, s.Labels["__target__"])
		}
		if s.Labels["env"] != "test" {
			t.Errorf("sample %s: expected env=test, got %s", s.MetricName, s.Labels["env"])
		}
	}

	// Count pre-computed percentiles (should be 3: p50, p95, p99)
	percentileCount := 0
	for _, s := range samples {
		if s.MetricName == "http_request_duration_seconds" && s.Labels["quantile"] != "" {
			percentileCount++
		}
	}
	if percentileCount != 3 {
		t.Errorf("expected 3 pre-computed percentiles, got %d", percentileCount)
	}
}

func TestParseEmpty(t *testing.T) {
	samples, err := Parse([]byte(""), "test", nil)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if len(samples) != 0 {
		t.Errorf("expected 0 samples from empty input, got %d", len(samples))
	}
}
