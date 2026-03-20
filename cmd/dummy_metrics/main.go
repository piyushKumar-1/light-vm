package main

import (
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

// Simulates a realistic app exposing Prometheus /metrics.
var (
	mu             sync.Mutex
	requestsTotal  = map[string]float64{}
	durationSum    float64
	durationCount  int64
	durationBounds = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0}
	durationBucket = make([]int64, len(durationBounds)+1) // last is +Inf
	goroutines     = 42
	memoryBytes    = 50_000_000.0
	startTime      = time.Now()
)

func init() {
	// Background goroutine to simulate traffic
	go func() {
		methods := []string{"GET", "POST", "PUT", "DELETE"}
		statuses := []string{"200", "201", "204", "400", "404", "500"}
		statusWeights := []int{70, 10, 5, 8, 5, 2}

		for {
			method := methods[rand.Intn(len(methods))]
			status := weightedChoice(statuses, statusWeights)

			mu.Lock()
			key := fmt.Sprintf("%s_%s", method, status)
			requestsTotal[key]++

			// Simulate a latency sample
			latency := simulateLatency()
			durationSum += latency
			durationCount++
			for i, bound := range durationBounds {
				if latency <= bound {
					durationBucket[i]++
				}
			}
			durationBucket[len(durationBounds)]++ // +Inf always incremented

			// Jitter on goroutines and memory
			goroutines += rand.Intn(5) - 2
			if goroutines < 10 {
				goroutines = 10
			}
			memoryBytes += float64(rand.Intn(500_000) - 200_000)
			if memoryBytes < 10_000_000 {
				memoryBytes = 10_000_000
			}
			mu.Unlock()

			time.Sleep(time.Duration(50+rand.Intn(200)) * time.Millisecond)
		}
	}()
}

func simulateLatency() float64 {
	// Bimodal: mostly fast, sometimes slow
	if rand.Float64() < 0.9 {
		return 0.01 + rand.Float64()*0.08 // 10-90ms
	}
	return 0.2 + rand.Float64()*0.8 // 200ms-1s (slow requests)
}

func weightedChoice(items []string, weights []int) string {
	total := 0
	for _, w := range weights {
		total += w
	}
	r := rand.Intn(total)
	cumulative := 0
	for i, w := range weights {
		cumulative += w
		if r < cumulative {
			return items[i]
		}
	}
	return items[len(items)-1]
}

func metricsHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")

	// Counter: http_requests_total
	fmt.Fprintln(w, "# HELP http_requests_total Total number of HTTP requests.")
	fmt.Fprintln(w, "# TYPE http_requests_total counter")
	for key, val := range requestsTotal {
		var method, status string
		fmt.Sscanf(key, "%4s_%3s", &method, &status)
		// Parse properly
		for i, c := range key {
			if c == '_' {
				method = key[:i]
				status = key[i+1:]
				break
			}
		}
		fmt.Fprintf(w, "http_requests_total{method=%q,status=%q} %g\n", method, status, val)
	}

	// Histogram: http_request_duration_seconds
	fmt.Fprintln(w, "# HELP http_request_duration_seconds HTTP request latency in seconds.")
	fmt.Fprintln(w, "# TYPE http_request_duration_seconds histogram")
	cumulative := int64(0)
	for i, bound := range durationBounds {
		cumulative += durationBucket[i]
		fmt.Fprintf(w, "http_request_duration_seconds_bucket{le=\"%g\"} %d\n", bound, cumulative)
	}
	fmt.Fprintf(w, "http_request_duration_seconds_bucket{le=\"+Inf\"} %d\n", durationCount)
	fmt.Fprintf(w, "http_request_duration_seconds_sum %g\n", durationSum)
	fmt.Fprintf(w, "http_request_duration_seconds_count %d\n", durationCount)

	// Gauge: go_goroutines
	fmt.Fprintln(w, "# HELP go_goroutines Number of goroutines that currently exist.")
	fmt.Fprintln(w, "# TYPE go_goroutines gauge")
	fmt.Fprintf(w, "go_goroutines %d\n", goroutines)

	// Gauge: process_resident_memory_bytes
	fmt.Fprintln(w, "# HELP process_resident_memory_bytes Resident memory size in bytes.")
	fmt.Fprintln(w, "# TYPE process_resident_memory_bytes gauge")
	fmt.Fprintf(w, "process_resident_memory_bytes %g\n", math.Round(memoryBytes))

	// Gauge: process_cpu_seconds_total
	fmt.Fprintln(w, "# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.")
	fmt.Fprintln(w, "# TYPE process_cpu_seconds_total counter")
	fmt.Fprintf(w, "process_cpu_seconds_total %g\n", time.Since(startTime).Seconds()*0.05)

	// Gauge: up
	fmt.Fprintln(w, "# HELP up Whether the target is up.")
	fmt.Fprintln(w, "# TYPE up gauge")
	fmt.Fprintln(w, "up 1")
}

func main() {
	http.HandleFunc("/metrics", metricsHandler)
	fmt.Println("dummy metrics server listening on :9100")
	if err := http.ListenAndServe(":9100", nil); err != nil {
		fmt.Printf("error: %v\n", err)
	}
}
