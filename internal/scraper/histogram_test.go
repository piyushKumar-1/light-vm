package scraper

import (
	"math"
	"testing"
)

func TestBucketQuantile(t *testing.T) {
	// Simulate a histogram with known distribution:
	// 10 requests in [0, 0.1], 20 in (0.1, 0.5], 70 in (0.5, 1.0], total=100
	buckets := []Bucket{
		{UpperBound: 0.1, CumulativeCount: 10},
		{UpperBound: 0.5, CumulativeCount: 30},
		{UpperBound: 1.0, CumulativeCount: 100},
		{UpperBound: math.Inf(1), CumulativeCount: 100},
	}

	tests := []struct {
		quantile float64
		wantMin  float64
		wantMax  float64
	}{
		{0.5, 0.5, 0.8},  // p50 should be in the third bucket range
		{0.95, 0.8, 1.0},  // p95 should be near the top of the third bucket
		{0.99, 0.9, 1.0},  // p99 should be very close to 1.0
		{0.05, 0.0, 0.1},  // p5 should be in the first bucket
	}

	for _, tt := range tests {
		result := bucketQuantile(tt.quantile, buckets)
		if math.IsNaN(result) {
			t.Errorf("p%.0f: got NaN, want [%f, %f]", tt.quantile*100, tt.wantMin, tt.wantMax)
			continue
		}
		if result < tt.wantMin || result > tt.wantMax {
			t.Errorf("p%.0f: got %f, want [%f, %f]", tt.quantile*100, result, tt.wantMin, tt.wantMax)
		}
	}
}

func TestBucketQuantileEmpty(t *testing.T) {
	result := bucketQuantile(0.5, nil)
	if !math.IsNaN(result) {
		t.Errorf("expected NaN for empty buckets, got %f", result)
	}
}

func TestBucketQuantileZeroCount(t *testing.T) {
	buckets := []Bucket{
		{UpperBound: 1.0, CumulativeCount: 0},
		{UpperBound: math.Inf(1), CumulativeCount: 0},
	}
	result := bucketQuantile(0.5, buckets)
	if !math.IsNaN(result) {
		t.Errorf("expected NaN for zero-count histogram, got %f", result)
	}
}

func TestComputePercentilesFromBuckets(t *testing.T) {
	buckets := []Bucket{
		{UpperBound: 0.005, CumulativeCount: 0},
		{UpperBound: 0.01, CumulativeCount: 0},
		{UpperBound: 0.025, CumulativeCount: 5},
		{UpperBound: 0.05, CumulativeCount: 10},
		{UpperBound: 0.1, CumulativeCount: 50},
		{UpperBound: 0.25, CumulativeCount: 80},
		{UpperBound: 0.5, CumulativeCount: 95},
		{UpperBound: 1.0, CumulativeCount: 100},
		{UpperBound: math.Inf(1), CumulativeCount: 100},
	}

	results := ComputePercentilesFromBuckets(buckets, []float64{0.5, 0.95, 0.99})
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// p50 should be around 0.1 (50 out of 100 at the 0.1 bucket)
	if results[0.5] < 0.05 || results[0.5] > 0.15 {
		t.Errorf("p50: got %f, expected ~0.1", results[0.5])
	}
	// p95 should be around 0.5
	if results[0.95] < 0.25 || results[0.95] > 0.75 {
		t.Errorf("p95: got %f, expected ~0.5", results[0.95])
	}
}
