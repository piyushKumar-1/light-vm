package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/piyushkumar-1/light_vm/internal/storage"
)

func (s *Server) handleQueryRange(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		http.Error(w, "metric parameter required", http.StatusBadRequest)
		return
	}

	target := r.URL.Query().Get("target")
	metricType := r.URL.Query().Get("type")

	start, end := parseTimeRange(r.URL.Query().Get("start"), r.URL.Query().Get("end"))

	// Incremental fetch: if "since" is provided, override start to avoid re-fetching
	if sinceStr := r.URL.Query().Get("since"); sinceStr != "" {
		if ts, err := strconv.ParseFloat(sinceStr, 64); err == nil {
			sinceTime := time.Unix(int64(ts), int64((ts-float64(int64(ts)))*1e9))
			sinceTime = sinceTime.Add(time.Millisecond)
			if sinceTime.After(start) {
				start = sinceTime
			}
		}
	}

	// Auto-compute step for downsampling based on time range
	var step time.Duration
	if stepStr := r.URL.Query().Get("step"); stepStr != "" {
		if v, err := strconv.ParseFloat(stepStr, 64); err == nil && v > 0 {
			step = time.Duration(v * float64(time.Second))
		}
	}
	if step == 0 {
		// Auto step: aim for ~1000 data points max
		rangeSeconds := end.Sub(start).Seconds()
		if rangeSeconds > 3600 { // only downsample for ranges > 1h
			autoStep := rangeSeconds / 1000.0
			if autoStep < 5 {
				autoStep = 5
			}
			step = time.Duration(autoStep * float64(time.Second))
		}
	}

	params := storage.QueryParams{
		MetricName: metric,
		Target:     target,
		Start:      start,
		End:        end,
		Step:       step,
	}

	if labelsStr := r.URL.Query().Get("labels"); labelsStr != "" {
		var labels map[string]string
		if err := json.Unmarshal([]byte(labelsStr), &labels); err == nil {
			params.LabelMatch = labels
		}
	}

	series, err := s.store.QueryRange(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	switch metricType {
	case "counter":
		for i := range series {
			series[i].Datapoints = computeRate(series[i].Datapoints)
		}
	case "histogram":
		// Always filter to only quantile-labeled series for histograms
		if percStr := r.URL.Query().Get("percentiles"); percStr != "" {
			requested := parsePercentiles(percStr)
			series = filterByQuantiles(series, requested)
		} else {
			// No specific percentiles requested — show all available quantiles
			series = filterHasQuantile(series)
		}
	default:
		// For any type: if percentiles are requested, filter by quantile label.
		// This handles gauge panels that are actually pre-computed histogram quantiles.
		if percStr := r.URL.Query().Get("percentiles"); percStr != "" {
			requested := parsePercentiles(percStr)
			series = filterByQuantiles(series, requested)
		}
	}

	// Remove empty series
	filtered := make([]storage.TimeSeries, 0, len(series))
	for _, ts := range series {
		if len(ts.Datapoints) > 0 {
			filtered = append(filtered, ts)
		}
	}

	writeJSON(w, QueryRangeResponse{Series: filtered})
}

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

// --- helpers ---

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

func computeRate(points [][2]float64) [][2]float64 {
	if len(points) < 2 {
		return nil
	}
	rates := make([][2]float64, 0, len(points)-1)
	for i := 1; i < len(points); i++ {
		dt := points[i][0] - points[i-1][0]
		dv := points[i][1] - points[i-1][1]
		if dt > 0 && dv >= 0 {
			rates = append(rates, [2]float64{points[i][0], dv / dt})
		}
	}
	return rates
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

func filterByQuantiles(series []storage.TimeSeries, quantiles []float64) []storage.TimeSeries {
	if len(quantiles) == 0 {
		return series
	}
	wanted := make(map[string]bool, len(quantiles))
	for _, q := range quantiles {
		wanted[strconv.FormatFloat(q, 'g', -1, 64)] = true
	}

	var filtered []storage.TimeSeries
	for _, ts := range series {
		if q, ok := ts.Labels["quantile"]; ok && wanted[q] {
			filtered = append(filtered, ts)
		}
	}
	return filtered
}

// filterHasQuantile keeps only series that have a "quantile" label.
func filterHasQuantile(series []storage.TimeSeries) []storage.TimeSeries {
	var filtered []storage.TimeSeries
	for _, ts := range series {
		if _, ok := ts.Labels["quantile"]; ok {
			filtered = append(filtered, ts)
		}
	}
	return filtered
}
