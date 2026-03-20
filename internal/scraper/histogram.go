package scraper

import (
	"math"
	"sort"

	dto "github.com/prometheus/client_model/go"
)

// Bucket is a simplified histogram bucket for percentile computation.
type Bucket struct {
	UpperBound      float64
	CumulativeCount float64
}

// ComputePercentiles calculates quantiles (0.0–1.0) from histogram buckets
// using the same linear interpolation algorithm as Prometheus histogram_quantile().
func ComputePercentiles(h *dto.Histogram, quantiles []float64) map[float64]float64 {
	buckets := make([]Bucket, 0, len(h.GetBucket()))
	for _, b := range h.GetBucket() {
		buckets = append(buckets, Bucket{
			UpperBound:      b.GetUpperBound(),
			CumulativeCount: float64(b.GetCumulativeCount()),
		})
	}
	return ComputePercentilesFromBuckets(buckets, quantiles)
}

// ComputePercentilesFromBuckets computes percentiles from pre-parsed bucket data.
func ComputePercentilesFromBuckets(buckets []Bucket, quantiles []float64) map[float64]float64 {
	sort.Slice(buckets, func(i, j int) bool {
		return buckets[i].UpperBound < buckets[j].UpperBound
	})
	results := make(map[float64]float64, len(quantiles))
	for _, q := range quantiles {
		results[q] = bucketQuantile(q, buckets)
	}
	return results
}

// bucketQuantile implements linear interpolation within histogram buckets.
func bucketQuantile(q float64, buckets []Bucket) float64 {
	if len(buckets) == 0 {
		return math.NaN()
	}
	if q < 0 {
		return math.Inf(-1)
	}
	if q > 1 {
		return math.Inf(1)
	}

	total := buckets[len(buckets)-1].CumulativeCount
	if total == 0 {
		return math.NaN()
	}

	rank := q * total

	for i, b := range buckets {
		if b.CumulativeCount >= rank {
			bucketStart := 0.0
			countBelow := 0.0
			if i > 0 {
				bucketStart = buckets[i-1].UpperBound
				countBelow = buckets[i-1].CumulativeCount
			}

			if math.IsInf(b.UpperBound, 1) {
				if i > 0 {
					return buckets[i-1].UpperBound
				}
				return math.NaN()
			}

			countInBucket := b.CumulativeCount - countBelow
			if countInBucket == 0 {
				return bucketStart
			}

			return bucketStart + (b.UpperBound-bucketStart)*(rank-countBelow)/countInBucket
		}
	}

	return buckets[len(buckets)-1].UpperBound
}
