import type { DashboardBody, PanelConfig, QueryConfig, YAxisConfig } from '../api/types'

// --- Grafana JSON types (subset we parse) ---

interface GrafanaDashboard {
  title?: string
  description?: string
  time?: { from?: string; to?: string }
  refresh?: string
  panels?: GrafanaPanel[]
  rows?: { panels?: GrafanaPanel[] }[]
  templating?: { list?: unknown[] }
}

interface GrafanaPanel {
  id?: number
  type?: string
  title?: string
  targets?: GrafanaTarget[]
  fieldConfig?: {
    defaults?: {
      unit?: string
      min?: number
      max?: number
    }
  }
  yaxes?: { format?: string; min?: string | null; max?: string | null }[]
}

interface GrafanaTarget {
  expr?: string
  refId?: string
  legendFormat?: string
}

// --- Result types ---

export interface ConversionWarning {
  panelTitle: string
  message: string
}

export interface SkippedPanel {
  title: string
  type: string
  reason: string
}

export interface ConversionResult {
  dashboard: {
    name: string
    description: string
    config: DashboardBody
  }
  warnings: ConversionWarning[]
  skippedPanels: SkippedPanel[]
}

// --- Native light_vm detection ---

function isNativeLightVM(raw: Record<string, unknown>): boolean {
  const config = raw.config as Record<string, unknown> | undefined
  if (!config || !Array.isArray(config.panels)) return false
  if (config.panels.length === 0) return true
  const first = config.panels[0] as Record<string, unknown>
  return first != null && typeof first.query === 'object' && typeof first.y_axis === 'object'
}

// --- Main entry point ---

export function convertGrafanaDashboard(raw: unknown): ConversionResult {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid JSON: expected an object')
  }

  const obj = raw as Record<string, unknown>

  // Detect native light_vm format
  if (isNativeLightVM(obj)) {
    const config = obj.config as DashboardBody
    return {
      dashboard: {
        name: (obj.name as string) || 'Imported Dashboard',
        description: (obj.description as string) || '',
        config,
      },
      warnings: [],
      skippedPanels: [],
    }
  }

  const gd = raw as GrafanaDashboard

  // Validate it looks like a Grafana export
  if (!gd.panels && !gd.rows && !gd.title) {
    throw new Error(
      'Does not appear to be a Grafana dashboard export. Expected "panels" or "title" fields.',
    )
  }

  const warnings: ConversionWarning[] = []
  const skippedPanels: SkippedPanel[] = []

  // Check for template variables
  if (gd.templating?.list && (gd.templating.list as unknown[]).length > 0) {
    warnings.push({
      panelTitle: '(dashboard)',
      message: 'Grafana template variables detected and removed. Review imported queries.',
    })
  }

  // Flatten panels from modern and row-based formats
  const allPanels: GrafanaPanel[] = []
  if (gd.panels) {
    for (const p of gd.panels) {
      if (p.type === 'row') continue
      allPanels.push(p)
    }
  }
  if (gd.rows) {
    for (const row of gd.rows) {
      if (row.panels) {
        for (const p of row.panels) {
          if (p.type === 'row') continue
          allPanels.push(p)
        }
      }
    }
  }

  // Convert each panel
  const convertedPanels: PanelConfig[] = []
  for (const gp of allPanels) {
    const result = convertPanel(gp)
    convertedPanels.push(...result.panels)
    warnings.push(...result.warnings)
    if (result.skipped) {
      skippedPanels.push(result.skipped)
    }
  }

  return {
    dashboard: {
      name: gd.title || 'Imported Dashboard',
      description: gd.description || '',
      config: {
        ui_refresh: convertRefreshInterval(gd.refresh),
        rescrape_interval: '5m0s',
        time_range: convertGrafanaTimeRange(gd.time?.from),
        panels: convertedPanels,
      },
    },
    warnings,
    skippedPanels,
  }
}

// --- Panel conversion ---

const TIMESERIES_TYPES = new Set(['timeseries', 'graph', 'xychart'])
const CONVERTIBLE_TYPES = new Set(['stat', 'gauge', 'bargauge', 'singlestat'])
const SKIP_TYPES = new Set(['row', 'text', 'news', 'dashlist', 'table', 'alertlist', 'annolist', 'logs'])

function convertPanel(gp: GrafanaPanel): {
  panels: PanelConfig[]
  warnings: ConversionWarning[]
  skipped?: SkippedPanel
} {
  const panelTitle = gp.title || 'Untitled'
  const panelType = gp.type || 'unknown'

  // Skip unsupported types
  if (SKIP_TYPES.has(panelType)) {
    return {
      panels: [],
      warnings: [],
      skipped: { title: panelTitle, type: panelType, reason: `Panel type "${panelType}" has no metric query equivalent` },
    }
  }

  const warnings: ConversionWarning[] = []

  // Warn about type conversion
  if (!TIMESERIES_TYPES.has(panelType) && CONVERTIBLE_TYPES.has(panelType)) {
    warnings.push({ panelTitle, message: `Panel type "${panelType}" converted to timeseries` })
  } else if (!TIMESERIES_TYPES.has(panelType) && !CONVERTIBLE_TYPES.has(panelType)) {
    warnings.push({ panelTitle, message: `Unknown panel type "${panelType}" converted to timeseries` })
  }

  // Extract y-axis config from fieldConfig (modern) or yaxes (legacy)
  const yAxis = extractYAxis(gp, warnings, panelTitle)

  // No targets = skip
  if (!gp.targets || gp.targets.length === 0) {
    return {
      panels: [],
      warnings,
      skipped: { title: panelTitle, type: panelType, reason: 'No query targets' },
    }
  }

  // Convert targets
  const panels: PanelConfig[] = []
  const multi = gp.targets.length > 1

  if (multi) {
    warnings.push({
      panelTitle,
      message: `Had ${gp.targets.length} targets; split into ${gp.targets.length} panels`,
    })
  }

  for (let i = 0; i < gp.targets.length; i++) {
    const target = gp.targets[i]
    const expr = target.expr?.trim()
    if (!expr) continue

    const parsed = parsePromQLMetric(expr)
    warnings.push(
      ...parsed.warnings.map(msg => ({ panelTitle, message: msg })),
    )

    const labelDisplay = convertLegendFormat(target.legendFormat)

    const query: QueryConfig = {
      metric: parsed.metric,
      type: parsed.type,
      target: parsed.target,
      ...(parsed.percentiles.length > 0 && { percentiles: parsed.percentiles }),
      ...(Object.keys(parsed.labels).length > 0 && { labels: parsed.labels }),
      ...(labelDisplay && { label_display: labelDisplay }),
    }

    const title = multi && i > 0 ? `${panelTitle} (${target.refId || String.fromCharCode(65 + i)})` : panelTitle

    panels.push({ title, type: 'timeseries', query, y_axis: yAxis })
  }

  if (panels.length === 0) {
    return {
      panels: [],
      warnings,
      skipped: { title: panelTitle, type: panelType, reason: 'All targets had empty expressions' },
    }
  }

  return { panels, warnings }
}

// --- Y-axis extraction ---

function extractYAxis(
  gp: GrafanaPanel,
  warnings: ConversionWarning[],
  panelTitle: string,
): YAxisConfig {
  // Modern format: fieldConfig.defaults
  if (gp.fieldConfig?.defaults) {
    const d = gp.fieldConfig.defaults
    return {
      unit: convertUnit(d.unit, warnings, panelTitle),
      ...(d.min != null && { min: d.min }),
      ...(d.max != null && { max: d.max }),
    }
  }

  // Legacy format: yaxes array
  if (gp.yaxes && gp.yaxes.length > 0) {
    const y = gp.yaxes[0]
    return {
      unit: convertUnit(y.format ?? undefined, warnings, panelTitle),
      ...(y.min != null && { min: parseFloat(y.min) }),
      ...(y.max != null && { max: parseFloat(y.max) }),
    }
  }

  return { unit: '' }
}

// --- PromQL parsing ---

interface ParsedPromQL {
  metric: string
  type: string
  target: string
  labels: Record<string, string>
  percentiles: number[]
  warnings: string[]
}

export function parsePromQLMetric(expr: string): ParsedPromQL {
  const warnings: string[] = []
  let type = 'gauge'
  let percentiles: number[] = []
  const trimmed = expr.trim()

  // Strip template variables
  let cleaned = trimmed
  if (/\$\{?\w+\}?/.test(cleaned)) {
    cleaned = cleaned.replace(/\$\{?\w+\}?/g, '')
    // Clean up empty selectors left behind
    cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}').replace(/\{\s*\}/g, '')
  }

  // Detect histogram_quantile
  const hqMatch = cleaned.match(/histogram_quantile\s*\(\s*([\d.]+)\s*,/)
  if (hqMatch) {
    type = 'histogram'
    const q = parseFloat(hqMatch[1])
    if (!isNaN(q)) percentiles = [q]
  }
  // Detect rate/increase/irate -> counter
  else if (/\b(rate|irate|increase|resets)\s*\(/.test(cleaned)) {
    type = 'counter'
  }

  // Extract metric name
  const metric = extractMetricName(cleaned)
  if (!metric) {
    warnings.push('Could not extract metric name from expression; review manually')
    return { metric: expr.slice(0, 60), type, target: '*', labels: {}, percentiles, warnings }
  }

  // Check for binary operators suggesting complex expression
  const binaryOps = /\s[+\-*/]\s/.test(
    // Remove everything inside braces and brackets to avoid false positives
    cleaned.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, ''),
  )
  if (binaryOps) {
    warnings.push('Complex PromQL expression simplified; review metric and query type')
  }

  // Extract labels from the metric's label selector
  const labels = extractLabels(cleaned, metric, warnings)

  // Map job label to target
  let target = '*'
  if (labels.job) {
    target = labels.job
    delete labels.job
  }

  // Strip _bucket suffix for histogram metrics
  let finalMetric = metric
  if (type === 'histogram' && finalMetric.endsWith('_bucket')) {
    finalMetric = finalMetric.slice(0, -7)
  }

  return { metric: finalMetric, type, target, labels, percentiles, warnings }
}

function extractMetricName(expr: string): string | null {
  // Try to find metric name pattern: an identifier optionally followed by { or [
  // Strip outer aggregation/function wrappers first
  let inner = expr

  // Peel off common outer functions layer by layer
  const funcPattern = /^\s*(?:histogram_quantile\s*\(\s*[\d.]+\s*,|(?:sum|avg|min|max|count|stddev|stdvar|topk|bottomk|quantile|count_values|group)\s*(?:by\s*\([^)]*\)|without\s*\([^)]*\))?\s*\(|(?:rate|irate|increase|resets|delta|deriv|abs|ceil|floor|round|exp|ln|log2|log10|sqrt|clamp|clamp_min|clamp_max|absent|absent_over_time|changes|label_replace|label_join|sort|sort_desc|time|vector|scalar)\s*\()/i

  // Peel up to 5 layers of functions
  for (let i = 0; i < 5; i++) {
    const match = inner.match(funcPattern)
    if (!match) break
    inner = inner.slice(match[0].length)
    // Remove trailing )
    const lastParen = inner.lastIndexOf(')')
    if (lastParen >= 0) {
      inner = inner.slice(0, lastParen)
    }
  }

  // Now try to extract the metric name
  const metricMatch = inner.match(/([a-zA-Z_:][a-zA-Z0-9_:]*)/)
  return metricMatch ? metricMatch[1] : null
}

function extractLabels(
  expr: string,
  metric: string,
  warnings: string[],
): Record<string, string> {
  const labels: Record<string, string> = {}

  // Find label selector block after the metric name
  const idx = expr.indexOf(metric)
  if (idx < 0) return labels

  const afterMetric = expr.slice(idx + metric.length)
  // Also check for _bucket variant
  const bucketAfter = expr.includes(metric + '_bucket')
    ? expr.slice(expr.indexOf(metric + '_bucket') + metric.length + 7)
    : null

  const selectorStr = afterMetric || bucketAfter || ''
  const braceMatch = selectorStr.match(/^\s*\{([^}]*)\}/)
  if (!braceMatch) return labels

  const selectorContent = braceMatch[1]
  // Parse individual label matchers
  const matcherRegex = /(\w+)\s*(=~|!~|!=|=)\s*"([^"]*)"/g
  let m
  while ((m = matcherRegex.exec(selectorContent)) !== null) {
    const [, key, op, value] = m
    if (op === '=' && value && !/\$\{?\w+\}?/.test(value)) {
      labels[key] = value
    } else if (op === '=~' || op === '!~') {
      warnings.push(`Label "${key}${op}..." uses regex matching; dropped`)
    }
  }

  return labels
}

// --- Unit mapping ---

const UNIT_MAP: Record<string, string> = {
  s: 'seconds',
  seconds: 'seconds',
  dtdurations: 'seconds',
  ms: 'seconds',
  bytes: 'bytes',
  decbytes: 'bytes',
  bits: 'bytes',
  kbytes: 'bytes',
  mbytes: 'bytes',
  gbytes: 'bytes',
  percent: 'percent',
  percentunit: 'percent',
  ops: 'ops/s',
  'ops/s': 'ops/s',
  opm: 'ops/s',
  reqps: 'ops/s',
  rps: 'ops/s',
  iops: 'ops/s',
  short: '',
  none: '',
}

function convertUnit(
  grafanaUnit: string | undefined,
  warnings: ConversionWarning[],
  panelTitle: string,
): string {
  if (!grafanaUnit) return ''
  const mapped = UNIT_MAP[grafanaUnit]
  if (mapped !== undefined) return mapped
  warnings.push({ panelTitle, message: `Unknown Grafana unit "${grafanaUnit}"; defaulting to none` })
  return ''
}

// --- Time range conversion ---

function convertGrafanaTimeRange(from: string | undefined): string {
  if (!from) return '1h0m0s'
  const match = from.match(/^now-(\d+)([smhdw])$/)
  if (!match) return '1h0m0s'

  const n = parseInt(match[1], 10)
  switch (match[2]) {
    case 's': return `${n}s`
    case 'm': return `${n}m0s`
    case 'h': return `${n}h0m0s`
    case 'd': return `${n * 24}h0m0s`
    case 'w': return `${n * 168}h0m0s`
    default: return '1h0m0s'
  }
}

// --- Refresh interval conversion ---

function convertRefreshInterval(refresh: string | undefined): string {
  if (!refresh) return '5s'
  // Grafana uses "5s", "10s", "1m", "5m" etc.
  // Normalize to include sub-units
  if (/^\d+s$/.test(refresh)) return refresh
  if (/^\d+m$/.test(refresh)) return refresh + '0s'
  if (/^\d+h$/.test(refresh)) return refresh + '0m0s'
  return '5s'
}

// --- Legend format conversion ---

function convertLegendFormat(legendFormat: string | undefined): string[] | undefined {
  if (!legendFormat) return undefined
  const labels: string[] = []
  const re = /\{\{\s*(\w+)\s*\}\}/g
  let m
  while ((m = re.exec(legendFormat)) !== null) {
    labels.push(m[1])
  }
  return labels.length > 0 ? labels : undefined
}
