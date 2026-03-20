package scraper

import (
	"bytes"
	"fmt"
	"math"
	"time"

	dto "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
	"github.com/prometheus/common/model"

	"github.com/piyushkumar-1/light_vm/internal/storage"
)

// Parse converts raw Prometheus exposition text into storage samples.
// It handles counters, gauges, histograms, and summaries.
func Parse(body []byte, targetName string, extraLabels map[string]string) ([]storage.Sample, error) {
	parser := expfmt.NewTextParser(model.UTF8Validation)
	families, err := parser.TextToMetricFamilies(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("parse metrics: %w", err)
	}

	var samples []storage.Sample
	now := time.Now()

	for name, family := range families {
		metricType := family.GetType()

		for _, m := range family.GetMetric() {
			labels := mergeLabels(m.GetLabel(), extraLabels, targetName)
			ts := now
			if m.GetTimestampMs() != 0 {
				ts = time.UnixMilli(m.GetTimestampMs())
			}

			switch metricType {
			case dto.MetricType_COUNTER:
				samples = append(samples, storage.Sample{
					MetricName: name,
					Labels:     labels,
					Value:      m.GetCounter().GetValue(),
					Timestamp:  ts,
					MetricType: "counter",
				})

			case dto.MetricType_GAUGE:
				samples = append(samples, storage.Sample{
					MetricName: name,
					Labels:     labels,
					Value:      m.GetGauge().GetValue(),
					Timestamp:  ts,
					MetricType: "gauge",
				})

			case dto.MetricType_UNTYPED:
				samples = append(samples, storage.Sample{
					MetricName: name,
					Labels:     labels,
					Value:      m.GetUntyped().GetValue(),
					Timestamp:  ts,
					MetricType: "gauge",
				})

			case dto.MetricType_HISTOGRAM:
				h := m.GetHistogram()
				// Store each bucket
				for _, b := range h.GetBucket() {
					bucketLabels := copyLabels(labels)
					bucketLabels["le"] = formatFloat(b.GetUpperBound())
					samples = append(samples, storage.Sample{
						MetricName: name + "_bucket",
						Labels:     bucketLabels,
						Value:      float64(b.GetCumulativeCount()),
						Timestamp:  ts,
						MetricType: "histogram_bucket",
					})
				}
				// _count and _sum
				samples = append(samples, storage.Sample{
					MetricName: name + "_count",
					Labels:     labels,
					Value:      float64(h.GetSampleCount()),
					Timestamp:  ts,
					MetricType: "counter",
				}, storage.Sample{
					MetricName: name + "_sum",
					Labels:     labels,
					Value:      h.GetSampleSum(),
					Timestamp:  ts,
					MetricType: "counter",
				})
				// Pre-compute common percentiles
				percentiles := ComputePercentiles(h, []float64{0.5, 0.95, 0.99})
				for phi, val := range percentiles {
					pLabels := copyLabels(labels)
					pLabels["quantile"] = formatFloat(phi)
					samples = append(samples, storage.Sample{
						MetricName: name,
						Labels:     pLabels,
						Value:      val,
						Timestamp:  ts,
						MetricType: "gauge",
					})
				}

			case dto.MetricType_SUMMARY:
				s := m.GetSummary()
				for _, q := range s.GetQuantile() {
					qLabels := copyLabels(labels)
					qLabels["quantile"] = formatFloat(q.GetQuantile())
					samples = append(samples, storage.Sample{
						MetricName: name,
						Labels:     qLabels,
						Value:      q.GetValue(),
						Timestamp:  ts,
						MetricType: "gauge",
					})
				}
				samples = append(samples, storage.Sample{
					MetricName: name + "_count",
					Labels:     labels,
					Value:      float64(s.GetSampleCount()),
					Timestamp:  ts,
					MetricType: "counter",
				}, storage.Sample{
					MetricName: name + "_sum",
					Labels:     labels,
					Value:      s.GetSampleSum(),
					Timestamp:  ts,
					MetricType: "counter",
				})
			}
		}
	}
	return samples, nil
}

func mergeLabels(protoLabels []*dto.LabelPair, extra map[string]string, target string) map[string]string {
	labels := map[string]string{"__target__": target}
	for _, lp := range protoLabels {
		labels[lp.GetName()] = lp.GetValue()
	}
	for k, v := range extra {
		labels[k] = v
	}
	return labels
}

func copyLabels(src map[string]string) map[string]string {
	dst := make(map[string]string, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func formatFloat(v float64) string {
	if math.IsInf(v, 1) {
		return "+Inf"
	}
	return fmt.Sprintf("%g", v)
}
