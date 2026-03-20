package config

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Global     GlobalConfig      `yaml:"global"`
	Auth       AuthConfig        `yaml:"auth"`
	Storage    StorageConfig     `yaml:"storage"`
	Targets    []TargetConfig    `yaml:"targets"`
	Dashboards []DashboardConfig `yaml:"dashboards"`
}

type AuthConfig struct {
	Username string `yaml:"username" json:"-"`
	Password string `yaml:"password" json:"-"`
}

func (a AuthConfig) Enabled() bool {
	return a.Username != ""
}

type GlobalConfig struct {
	ScrapeInterval Duration `yaml:"scrape_interval"`
	ScrapeTimeout  Duration `yaml:"scrape_timeout"`
	Retention      Duration `yaml:"retention"`
	ListenAddress  string   `yaml:"listen_address"`
}

type StorageConfig struct {
	Path    string `yaml:"path"`
	WALMode bool   `yaml:"wal_mode"`
}

type TargetConfig struct {
	Name           string            `yaml:"name" json:"name"`
	URL            string            `yaml:"url" json:"url"`
	ScrapeInterval Duration          `yaml:"scrape_interval,omitempty" json:"scrape_interval,omitempty"`
	Labels         map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`
	Retention      Duration          `yaml:"retention,omitempty" json:"retention,omitempty"`
}

type DashboardConfig struct {
	Name              string        `yaml:"name" json:"name"`
	Refresh           Duration      `yaml:"refresh" json:"refresh"`
	UIRefresh         Duration      `yaml:"ui_refresh" json:"ui_refresh"`
	RescrapeInterval  Duration      `yaml:"rescrape_interval" json:"rescrape_interval"`
	TimeRange         Duration      `yaml:"time_range" json:"time_range"`
	Panels            []PanelConfig `yaml:"panels" json:"panels"`
}

type PanelConfig struct {
	Title string      `yaml:"title" json:"title"`
	Type  string      `yaml:"type" json:"type"`
	Query QueryConfig `yaml:"query" json:"query"`
	YAxis YAxisConfig `yaml:"y_axis" json:"y_axis"`
}

type QueryConfig struct {
	Metric       string            `yaml:"metric" json:"metric"`
	Type         string            `yaml:"type" json:"type"`
	Percentiles  []float64         `yaml:"percentiles,omitempty" json:"percentiles,omitempty"`
	Target       string            `yaml:"target" json:"target"`
	GroupBy      []string          `yaml:"group_by,omitempty" json:"group_by,omitempty"`
	Labels       map[string]string `yaml:"labels,omitempty" json:"labels,omitempty"`
	LabelDisplay []string          `yaml:"label_display,omitempty" json:"label_display,omitempty"`
}

type YAxisConfig struct {
	Unit string   `yaml:"unit" json:"unit"`
	Min  *float64 `yaml:"min,omitempty" json:"min,omitempty"`
	Max  *float64 `yaml:"max,omitempty" json:"max,omitempty"`
	Side int      `yaml:"side,omitempty" json:"side,omitempty"`
}

// Duration wraps time.Duration for YAML unmarshalling of duration strings.
type Duration struct {
	time.Duration
}

func formatDuration(dur time.Duration) string {
	if dur >= 24*time.Hour && dur%(24*time.Hour) == 0 {
		return fmt.Sprintf("%dd", int(dur/(24*time.Hour)))
	}
	return dur.String()
}

func (d Duration) MarshalYAML() (interface{}, error) {
	return formatDuration(d.Duration), nil
}

func (d Duration) MarshalJSON() ([]byte, error) {
	return []byte(`"` + formatDuration(d.Duration) + `"`), nil
}

var dayRe = regexp.MustCompile(`^(\d+)d(.*)$`)

// parseDurationWithDays extends time.ParseDuration to support "d" (days) suffix.
// Examples: "7d", "30d", "1d12h".
func parseDurationWithDays(s string) (time.Duration, error) {
	if m := dayRe.FindStringSubmatch(s); m != nil {
		days, _ := strconv.Atoi(m[1])
		dur := time.Duration(days) * 24 * time.Hour
		if m[2] != "" {
			rest, err := time.ParseDuration(m[2])
			if err != nil {
				return 0, err
			}
			dur += rest
		}
		return dur, nil
	}
	return time.ParseDuration(s)
}

func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	var s string
	if err := value.Decode(&s); err != nil {
		return err
	}
	dur, err := parseDurationWithDays(s)
	if err != nil {
		return err
	}
	d.Duration = dur
	return nil
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}
	return &cfg, nil
}

func (c *Config) applyDefaults() {
	if c.Global.ScrapeInterval.Duration == 0 {
		c.Global.ScrapeInterval.Duration = 15 * time.Second
	}
	if c.Global.ScrapeTimeout.Duration == 0 {
		c.Global.ScrapeTimeout.Duration = 10 * time.Second
	}
	if c.Global.Retention.Duration == 0 {
		c.Global.Retention.Duration = 3 * 24 * time.Hour // 3d
	}
	if c.Global.ListenAddress == "" {
		c.Global.ListenAddress = ":9090"
	}
	if c.Storage.Path == "" {
		c.Storage.Path = "./light_vm.db"
	}
	// WAL mode defaults to true via zero-value being false, so set explicitly
	// only if the user hasn't set it. We use a pointer trick in the YAML tag
	// but for simplicity, default to true here.
	if !c.Storage.WALMode {
		c.Storage.WALMode = true
	}
	for i := range c.Dashboards {
		if c.Dashboards[i].UIRefresh.Duration == 0 {
			c.Dashboards[i].UIRefresh.Duration = 5 * time.Second
		}
		if c.Dashboards[i].RescrapeInterval.Duration == 0 {
			c.Dashboards[i].RescrapeInterval.Duration = 5 * time.Minute
		}
		for j := range c.Dashboards[i].Panels {
			if c.Dashboards[i].Panels[j].YAxis.Side == 0 {
				c.Dashboards[i].Panels[j].YAxis.Side = 1
			}
		}
	}
}

func (c *Config) validate() error {
	if len(c.Targets) == 0 {
		return fmt.Errorf("at least one target is required")
	}

	names := make(map[string]bool)
	for i, t := range c.Targets {
		if t.Name == "" {
			return fmt.Errorf("target[%d]: name is required", i)
		}
		if names[t.Name] {
			return fmt.Errorf("target[%d]: duplicate name %q", i, t.Name)
		}
		names[t.Name] = true

		if t.URL == "" {
			return fmt.Errorf("target[%d] %q: url is required", i, t.Name)
		}
		if _, err := url.Parse(t.URL); err != nil {
			return fmt.Errorf("target[%d] %q: invalid url: %w", i, t.Name, err)
		}
	}

	if c.Global.ScrapeTimeout.Duration >= c.Global.ScrapeInterval.Duration {
		return fmt.Errorf("scrape_timeout (%s) must be less than scrape_interval (%s)",
			c.Global.ScrapeTimeout.Duration, c.Global.ScrapeInterval.Duration)
	}

	for i, d := range c.Dashboards {
		if d.Name == "" {
			return fmt.Errorf("dashboard[%d]: name is required", i)
		}
		for j, p := range d.Panels {
			if p.Title == "" {
				return fmt.Errorf("dashboard[%d] panel[%d]: title is required", i, j)
			}
			if p.Query.Metric == "" {
				return fmt.Errorf("dashboard[%d] panel[%d] %q: metric is required", i, j, p.Title)
			}
			switch p.Query.Type {
			case "counter", "gauge", "histogram", "summary":
			case "":
				return fmt.Errorf("dashboard[%d] panel[%d] %q: query type is required", i, j, p.Title)
			default:
				return fmt.Errorf("dashboard[%d] panel[%d] %q: unknown query type %q", i, j, p.Title, p.Query.Type)
			}
		}
	}

	return nil
}
