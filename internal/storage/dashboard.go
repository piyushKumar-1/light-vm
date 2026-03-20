package storage

import "time"

// Dashboard is the DB-level representation of a user-created dashboard.
type Dashboard struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	ConfigJSON  string        `json:"-"`
	Config      DashboardBody `json:"config"`
	SortOrder   int           `json:"sort_order"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
}

// DashboardBody is the JSON blob stored in config_json.
type DashboardBody struct {
	UIRefresh        string      `json:"ui_refresh"`
	RescrapeInterval string      `json:"rescrape_interval"`
	TimeRange        string      `json:"time_range"`
	Panels           []PanelBody `json:"panels"`
}

type PanelBody struct {
	Title string    `json:"title"`
	Type  string    `json:"type"`
	Query QueryBody `json:"query"`
	YAxis YAxisBody `json:"y_axis"`
}

type QueryBody struct {
	Metric       string            `json:"metric"`
	Type         string            `json:"type"`
	Percentiles  []float64         `json:"percentiles,omitempty"`
	Target       string            `json:"target"`
	GroupBy      []string          `json:"group_by,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	LabelDisplay []string          `json:"label_display,omitempty"`
}

type YAxisBody struct {
	Unit string   `json:"unit"`
	Min  *float64 `json:"min,omitempty"`
	Max  *float64 `json:"max,omitempty"`
	Side int      `json:"side,omitempty"`
}
