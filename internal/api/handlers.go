package api

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/piyushkumar-1/light_vm/internal/scraper"
	"github.com/piyushkumar-1/light_vm/internal/storage"
)

// handleQueryRange serves time-series data for a single metric.
// Like Grafana, it computes a step interval (range / maxDataPoints) and uses
// SQL-level downsampling for all query types to handle any time range efficiently.
// Results are cached briefly to avoid recomputation on polling intervals.
func (s *Server) handleQueryRange(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		http.Error(w, "metric parameter required", http.StatusBadRequest)
		return
	}

	target := r.URL.Query().Get("target")
	metricType := r.URL.Query().Get("type")
	start, end := parseTimeRange(r.URL.Query().Get("start"), r.URL.Query().Get("end"))

	var labelMatch map[string]string
	labelsStr := r.URL.Query().Get("labels")
	if labelsStr != "" {
		_ = json.Unmarshal([]byte(labelsStr), &labelMatch)
	}

	rangeSec := end.Sub(start).Seconds()

	// Cache key based on query identity (metric, type, range duration) not exact timestamps.
	// Consecutive polls for the same panel always share the same cache entry.
	rangeStr := strconv.FormatInt(int64(rangeSec), 10)
	cacheKey := metric + "|" + target + "|" + metricType + "|" + rangeStr + "|" +
		labelsStr + "|" + r.URL.Query().Get("percentiles") + "|" + r.URL.Query().Get("max_series")

	s.queryCacheMu.Lock()
	if entry, ok := s.queryCache[cacheKey]; ok && time.Now().Before(entry.expiresAt) {
		data := entry.data
		s.queryCacheMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
		return
	}
	s.queryCacheMu.Unlock()

	// Compute step for SQL-level downsampling, like Grafana's maxDataPoints.
	// Target ~300 points per series. Only downsample when step > 5s.
	var step time.Duration
	if autoStep := rangeSec / 300; autoStep > 5 {
		step = time.Duration(autoStep * float64(time.Second))
	}

	// Rate window: 1/3 of time range, clamped to [15s, 300s]
	rateWindow := clamp(rangeSec/3, 15, 300)
	startSec := float64(start.UnixMilli()) / 1000.0

	var series []storage.TimeSeries
	var err error

	switch metricType {
	case "counter":
		series, err = s.queryCounter(r.Context(), metric, target, start, end, labelMatch, rateWindow, startSec, step)

	case "histogram":
		percentiles := []float64{0.5, 0.95, 0.99}
		if p := r.URL.Query().Get("percentiles"); p != "" {
			percentiles = parsePercentiles(p)
		}
		series, err = s.queryHistogram(r.Context(), metric, target, start, end, labelMatch, percentiles, rateWindow, startSec, step)

	default:
		series, err = s.queryGauge(r.Context(), metric, target, start, end, labelMatch, step)
		if err == nil {
			if p := r.URL.Query().Get("percentiles"); p != "" {
				series = filterByQuantiles(series, parsePercentiles(p))
			}
		}
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Final safety: thin output to ~300 points per series
	for i := range series {
		series[i].Datapoints = thinPoints(series[i].Datapoints, 300)
	}

	// Strip empty series
	result := filterNonEmpty(series)

	// Cap series count
	maxSeries := 50
	if v := r.URL.Query().Get("max_series"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 {
			maxSeries = n
		}
	}
	truncated := len(result) > maxSeries
	if truncated {
		result = result[:maxSeries]
	}

	resp := QueryRangeResponse{Series: result, Truncated: truncated}
	data, _ := json.Marshal(resp)

	// Cache the result. TTL scales with range: short ranges change faster.
	// Longer TTLs reduce recomputation frequency for expensive histogram queries.
	ttl := 10 * time.Second
	if rangeSec >= 3600 {
		ttl = 30 * time.Second
	} else if rangeSec >= 600 {
		ttl = 15 * time.Second
	}
	s.queryCacheMu.Lock()
	s.queryCache[cacheKey] = queryCacheEntry{data: data, expiresAt: time.Now().Add(ttl)}
	// Evict expired entries periodically (cheap: only when cache grows large)
	if len(s.queryCache) > 200 {
		now := time.Now()
		for k, v := range s.queryCache {
			if now.After(v.expiresAt) {
				delete(s.queryCache, k)
			}
		}
	}
	s.queryCacheMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
	w.Write([]byte("\n"))
}

// --- query helpers per metric type ---

// queryGauge returns sample data for [start, end], using SQL-level AVG
// downsampling when step > 0 to handle large time ranges.
func (s *Server) queryGauge(ctx context.Context, metric, target string, start, end time.Time, labels map[string]string, step time.Duration) ([]storage.TimeSeries, error) {
	return s.store.QueryRange(ctx, storage.QueryParams{
		MetricName: metric,
		Target:     target,
		Start:      start,
		End:        end,
		Step:       step,
		LabelMatch: labels,
	})
}

// queryCounter fetches counter data with lookback, applies SQL-level AVG
// downsampling, then computes windowed rate. AVG of monotonic counters
// preserves rate semantics since avg(C[t]) is still monotonically increasing.
func (s *Server) queryCounter(ctx context.Context, metric, target string, start, end time.Time, labels map[string]string, rateWindow, startSec float64, step time.Duration) ([]storage.TimeSeries, error) {
	lookback := time.Duration(rateWindow+60) * time.Second
	series, err := s.store.QueryRange(ctx, storage.QueryParams{
		MetricName: metric,
		Target:     target,
		Start:      start.Add(-lookback),
		End:        end,
		Step:       step,
		LabelMatch: labels,
	})
	if err != nil {
		return nil, err
	}
	for i := range series {
		series[i].Datapoints = windowedRate(series[i].Datapoints, rateWindow, startSec)
	}
	return series, nil
}

// queryHistogram computes percentiles from histogram bucket rate data.
// Uses SQL-level downsampling on bucket data, then rate + percentile computation.
func (s *Server) queryHistogram(ctx context.Context, metric, target string, start, end time.Time, labels map[string]string, percentiles []float64, rateWindow, startSec float64, step time.Duration) ([]storage.TimeSeries, error) {
	bucketLabels := copyWithout(labels, "quantile")
	lookback := time.Duration(rateWindow+60) * time.Second

	bucketSeries, err := s.store.QueryRange(ctx, storage.QueryParams{
		MetricName: metric + "_bucket",
		Target:     target,
		Start:      start.Add(-lookback),
		End:        end,
		Step:       step,
		LabelMatch: bucketLabels,
	})
	if err != nil {
		return nil, err
	}

	if len(bucketSeries) > 0 {
		return histogramPercentiles(bucketSeries, percentiles, rateWindow, startSec), nil
	}

	// Fallback: return pre-computed quantile series from storage
	series, err := s.store.QueryRange(ctx, storage.QueryParams{
		MetricName: metric,
		Target:     target,
		Start:      start,
		End:        end,
		Step:       step,
		LabelMatch: labels,
	})
	if err != nil {
		return nil, err
	}
	return filterHasLabel(series, "quantile"), nil
}

// --- rate & histogram computation ---

// windowedRate computes rate over a sliding window (like Prometheus rate()).
// Returns only points with timestamp >= minTS.
func windowedRate(points [][2]float64, windowSec, minTS float64) [][2]float64 {
	if len(points) < 2 {
		return nil
	}
	var result [][2]float64
	j := 0
	for i := 1; i < len(points); i++ {
		for j < i-1 && points[j+1][0] <= points[i][0]-windowSec {
			j++
		}
		dt := points[i][0] - points[j][0]
		dv := points[i][1] - points[j][1]
		if dt > 0 && dv >= 0 && points[i][0] >= minTS {
			result = append(result, [2]float64{points[i][0], dv / dt})
		}
	}
	return result
}

// histogramPercentiles derives percentile time series from bucket rate data.
// Uses dense arrays for rate storage and batches percentile computation per timestamp.
func histogramPercentiles(bucketSeries []storage.TimeSeries, percentiles []float64, rateWindowSec, minTS float64) []storage.TimeSeries {
	type bucketRates struct {
		le    float64
		rates [][2]float64 // sorted by timestamp
	}
	type group struct {
		labels  map[string]string
		buckets []bucketRates
	}

	groups := make(map[string]*group)

	for _, ts := range bucketSeries {
		leStr, ok := ts.Labels["le"]
		if !ok {
			continue
		}
		le, err := strconv.ParseFloat(leStr, 64)
		if err != nil {
			if leStr == "+Inf" {
				le = math.Inf(1)
			} else {
				continue
			}
		}

		base := copyWithout(ts.Labels, "le")
		key := labelsKey(base)

		g, ok := groups[key]
		if !ok {
			g = &group{labels: base}
			groups[key] = g
		}

		rates := windowedRate(ts.Datapoints, rateWindowSec, 0)
		if len(rates) == 0 {
			continue
		}
		g.buckets = append(g.buckets, bucketRates{le: le, rates: rates})
	}

	var result []storage.TimeSeries

	for _, g := range groups {
		if len(g.buckets) == 0 {
			continue
		}
		sort.Slice(g.buckets, func(i, j int) bool {
			return g.buckets[i].le < g.buckets[j].le
		})

		// Collect unique timestamps >= minTS
		tsSet := make(map[float64]struct{})
		for _, b := range g.buckets {
			for _, r := range b.rates {
				if r[0] >= minTS {
					tsSet[r[0]] = struct{}{}
				}
			}
		}
		timestamps := make([]float64, 0, len(tsSet))
		for t := range tsSet {
			timestamps = append(timestamps, t)
		}
		sort.Float64s(timestamps)
		nTS := len(timestamps)
		if nTS == 0 {
			continue
		}

		// Build timestamp → index map once
		tsIdx := make(map[float64]int, nTS)
		for i, t := range timestamps {
			tsIdx[t] = i
		}

		// Build dense rate matrix: rateMatrix[bucketIdx][timestampIdx]
		nBuckets := len(g.buckets)
		rateMatrix := make([][]float64, nBuckets)
		for bi, b := range g.buckets {
			row := make([]float64, nTS)
			for _, r := range b.rates {
				if idx, ok := tsIdx[r[0]]; ok {
					row[idx] = r[1]
				}
			}
			rateMatrix[bi] = row
		}

		// Pre-allocate per-percentile point buffers and reusable bucket slice
		pointSets := make([][][2]float64, len(percentiles))
		for pi := range pointSets {
			pointSets[pi] = make([][2]float64, 0, nTS)
		}
		bkts := make([]scraper.Bucket, nBuckets)

		// Compute all percentiles at each timestamp (one bucket build per timestamp)
		for ti, t := range timestamps {
			for bi := 0; bi < nBuckets; bi++ {
				rate := rateMatrix[bi][ti]
				if rate < 0 {
					rate = 0
				}
				bkts[bi] = scraper.Bucket{UpperBound: g.buckets[bi].le, CumulativeCount: rate}
			}
			pctValues := scraper.ComputePercentilesFromBuckets(bkts, percentiles)
			for pi, phi := range percentiles {
				v := pctValues[phi]
				if !math.IsNaN(v) && !math.IsInf(v, 0) {
					pointSets[pi] = append(pointSets[pi], [2]float64{t, v})
				}
			}
		}

		for pi, phi := range percentiles {
			if len(pointSets[pi]) == 0 {
				continue
			}
			pLabels := make(map[string]string, len(g.labels)+1)
			for k, v := range g.labels {
				pLabels[k] = v
			}
			pLabels["quantile"] = strconv.FormatFloat(phi, 'g', -1, 64)
			result = append(result, storage.TimeSeries{Labels: pLabels, Datapoints: pointSets[pi]})
		}
	}

	return result
}

// --- other handlers ---

func (s *Server) handleTargets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.scraper.TargetStatuses())
}

func (s *Server) handleListMetrics(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("target")
	metas, err := s.store.ListMetrics(r.Context(), target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, metas)
}

func (s *Server) handleLabelValues(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		http.Error(w, "metric parameter required", http.StatusBadRequest)
		return
	}
	label := r.URL.Query().Get("label")
	if label == "" {
		http.Error(w, "label parameter required", http.StatusBadRequest)
		return
	}
	target := r.URL.Query().Get("target")

	values, err := s.store.LabelValues(r.Context(), metric, target, label)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, values)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, HealthResponse{
		Status:        "ok",
		UptimeSeconds: int64(time.Since(s.startTime).Seconds()),
	})
}

// --- utility functions ---

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func parseTimeRange(startStr, endStr string) (time.Time, time.Time) {
	now := time.Now()
	end := now
	start := now.Add(-1 * time.Hour)

	if endStr != "" {
		if ts, err := strconv.ParseFloat(endStr, 64); err == nil {
			end = time.Unix(int64(ts), 0)
		} else if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			end = t
		}
	}
	if startStr != "" {
		if ts, err := strconv.ParseFloat(startStr, 64); err == nil {
			start = time.Unix(int64(ts), 0)
		} else if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			start = t
		}
	}

	return start, end
}

func parsePercentiles(s string) []float64 {
	parts := strings.Split(s, ",")
	result := make([]float64, 0, len(parts))
	for _, p := range parts {
		if v, err := strconv.ParseFloat(strings.TrimSpace(p), 64); err == nil {
			result = append(result, v)
		}
	}
	return result
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func copyWithout(m map[string]string, exclude string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		if k != exclude {
			out[k] = v
		}
	}
	return out
}

func labelsKey(labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var sb strings.Builder
	for i, k := range keys {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(k)
		sb.WriteByte('=')
		sb.WriteString(labels[k])
	}
	return sb.String()
}

// thinPoints keeps every Nth point to reduce to ~target count.
// Preserves first and last points for correct range coverage.
func thinPoints(pts [][2]float64, target int) [][2]float64 {
	if len(pts) <= target {
		return pts
	}
	step := float64(len(pts)) / float64(target)
	result := make([][2]float64, 0, target+1)
	for i := 0; i < target; i++ {
		idx := int(float64(i) * step)
		result = append(result, pts[idx])
	}
	// Always include the last point
	if last := pts[len(pts)-1]; len(result) == 0 || result[len(result)-1][0] != last[0] {
		result = append(result, last)
	}
	return result
}

func filterNonEmpty(series []storage.TimeSeries) []storage.TimeSeries {
	result := make([]storage.TimeSeries, 0, len(series))
	for _, ts := range series {
		if len(ts.Datapoints) > 0 {
			result = append(result, ts)
		}
	}
	return result
}

func filterHasLabel(series []storage.TimeSeries, label string) []storage.TimeSeries {
	var result []storage.TimeSeries
	for _, ts := range series {
		if _, ok := ts.Labels[label]; ok {
			result = append(result, ts)
		}
	}
	return result
}

func filterByQuantiles(series []storage.TimeSeries, quantiles []float64) []storage.TimeSeries {
	if len(quantiles) == 0 {
		return series
	}
	wanted := make(map[string]bool, len(quantiles))
	for _, q := range quantiles {
		wanted[strconv.FormatFloat(q, 'g', -1, 64)] = true
	}
	var result []storage.TimeSeries
	for _, ts := range series {
		if q, ok := ts.Labels["quantile"]; ok && wanted[q] {
			result = append(result, ts)
		}
	}
	return result
}
