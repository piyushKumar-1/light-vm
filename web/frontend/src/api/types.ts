export interface Dashboard {
  id: string
  name: string
  description: string
  config: DashboardBody
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DashboardBody {
  ui_refresh: string
  rescrape_interval: string
  time_range: string
  panels: PanelConfig[]
}

export interface GridPos {
  x: number
  y: number
  w: number
  h: number
}

export interface PanelConfig {
  title: string
  type: string
  query: QueryConfig
  y_axis: YAxisConfig
  grid_pos?: GridPos
}

export interface QueryConfig {
  metric: string
  type: string
  percentiles?: number[]
  target: string
  group_by?: string[]
  labels?: Record<string, string>
  label_display?: string[]
}

export interface YAxisConfig {
  unit: string
  min?: number
  max?: number
  side?: number // 1=left (default), 2=right
}

export interface TimeSeries {
  labels: Record<string, string>
  datapoints: [number, number][] // [timestamp_seconds, value]
}

export interface QueryRangeResponse {
  series: TimeSeries[]
  truncated?: boolean
}

export interface HealthResponse {
  status: string
  uptime_seconds: number
}

export interface TargetStatus {
  name: string
  url: string
  health: string
  last_scrape: string
  last_error: string
  scrape_duration_ms: number
  samples_scraped: number
}

export interface SessionInfo {
  authenticated: boolean
  auth_required: boolean
  username?: string
}

export interface MetricMeta {
  name: string
  type: string
  target: string
  label_names: string[]
}
