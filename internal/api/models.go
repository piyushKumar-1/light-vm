package api

import "github.com/piyushkumar-1/light_vm/internal/storage"

// QueryRangeResponse wraps the time-series query result.
type QueryRangeResponse struct {
	Series    []storage.TimeSeries `json:"series"`
	Truncated bool                 `json:"truncated,omitempty"`
}

// HealthResponse reports service health.
type HealthResponse struct {
	Status        string `json:"status"`
	UptimeSeconds int64  `json:"uptime_seconds"`
}
