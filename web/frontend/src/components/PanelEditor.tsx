import { useState, useEffect } from 'react'
import type { PanelConfig, MetricMeta, TargetStatus } from '../api/types'
import { getTargets, getMetrics } from '../api/client'
import { MetricBrowser } from './MetricBrowser'
import { LabelInput } from './LabelInput'

interface PanelEditorProps {
  panel: PanelConfig
  onSave: (panel: PanelConfig) => void
  onCancel: () => void
}

export function PanelEditor({ panel, onSave, onCancel }: PanelEditorProps) {
  const [title, setTitle] = useState(panel.title)
  const [metric, setMetric] = useState(panel.query.metric)
  const [queryType, setQueryType] = useState(panel.query.type)
  const [target, setTarget] = useState(panel.query.target || '*')
  const [percentiles, setPercentiles] = useState(
    panel.query.percentiles?.join(', ') || '',
  )
  const [labelDisplay, setLabelDisplay] = useState(
    panel.query.label_display?.join(', ') || '',
  )
  const [unit, setUnit] = useState(panel.y_axis.unit)
  const [yMin, setYMin] = useState(panel.y_axis.min?.toString() || '')
  const [yMax, setYMax] = useState(panel.y_axis.max?.toString() || '')
  const [ySide, setYSide] = useState(panel.y_axis.side || 1)
  const [gridW, setGridW] = useState(panel.grid_pos?.w ?? 6)
  const [gridH, setGridH] = useState(panel.grid_pos?.h ?? 2)

  // Targets dropdown
  const [targets, setTargets] = useState<TargetStatus[]>([])

  // Label filters (multi-value: each key maps to an array of values)
  const [metricMeta, setMetricMeta] = useState<MetricMeta | undefined>(undefined)
  const [labelFilters, setLabelFilters] = useState<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = {}
    if (panel.query.labels) {
      for (const [k, v] of Object.entries(panel.query.labels)) {
        result[k] = v.split('|')
      }
    }
    return result
  })

  // Fetch targets on mount
  useEffect(() => {
    getTargets().then(setTargets).catch(() => {})
  }, [])

  // Fix: Load MetricMeta on mount for existing metrics
  useEffect(() => {
    if (!panel.query.metric) return
    const t = panel.query.target && panel.query.target !== '*' ? panel.query.target : undefined
    getMetrics(t).then(metrics => {
      const found = metrics.find(m => m.name === panel.query.metric)
      if (found) setMetricMeta(found)
    }).catch(() => {})
  }, [])

  // Available label names (excluding internal __ labels)
  const availableLabels = (metricMeta?.label_names || []).filter(
    l => !l.startsWith('__'),
  )

  const handleMetricChange = (name: string, meta?: MetricMeta) => {
    setMetric(name)
    if (meta) {
      setMetricMeta(meta)
      if (meta.type) setQueryType(meta.type)
      if (meta.target && meta.target !== '*') setTarget(meta.target)
    }
  }

  const handleSave = () => {
    // Legend format: supports {{key}} templates or comma-separated key list
    let derivedDisplay: string[] | undefined
    const trimmed = labelDisplay.trim()
    if (trimmed) {
      if (trimmed.includes('{{')) {
        // Template mode: store as single element
        derivedDisplay = [trimmed]
      } else {
        derivedDisplay = trimmed.split(',').map(s => s.trim()).filter(Boolean)
      }
    } else if (Object.keys(labelFilters).length > 0) {
      // Auto-derive from filter keys
      derivedDisplay = Object.keys(labelFilters)
    }

    // Convert multi-value arrays to pipe-separated strings for the API
    const labelsForSave: Record<string, string> = {}
    for (const [k, vals] of Object.entries(labelFilters)) {
      if (vals.length > 0) {
        labelsForSave[k] = vals.join('|')
      }
    }

    const p: PanelConfig = {
      title,
      type: 'timeseries',
      query: {
        metric,
        type: queryType,
        target,
        percentiles: percentiles
          ? percentiles.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
          : undefined,
        label_display: derivedDisplay,
        labels: Object.keys(labelsForSave).length > 0 ? labelsForSave : undefined,
      },
      y_axis: {
        unit,
        min: yMin ? parseFloat(yMin) : undefined,
        max: yMax ? parseFloat(yMax) : undefined,
        side: ySide,
      },
      grid_pos: {
        x: panel.grid_pos?.x ?? 0,
        y: panel.grid_pos?.y ?? 0,
        w: gridW,
        h: gridH,
      },
    }
    onSave(p)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Panel</h3>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onCancel}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="modal-body">
          {/* Section: Basic */}
          <div className="editor-section">
            <div className="editor-section-title">Basic</div>
            <div className="form-group">
              <label>Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Panel title" />
            </div>
          </div>

          {/* Section: Data Source */}
          <div className="editor-section">
            <div className="editor-section-title">Data Source</div>
            <div className="form-group">
              <label>Metric</label>
              <MetricBrowser value={metric} onChange={handleMetricChange} target={target !== '*' ? target : undefined} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Query Type</label>
                <select value={queryType} onChange={e => setQueryType(e.target.value)}>
                  <option value="gauge">Gauge</option>
                  <option value="counter">Counter</option>
                  <option value="histogram">Histogram</option>
                  <option value="summary">Summary</option>
                </select>
              </div>
              <div className="form-group">
                <label>Target</label>
                <select value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="*">All targets</option>
                  {targets.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {(queryType === 'histogram' || queryType === 'summary') && (
              <div className="form-group">
                <label>Percentiles</label>
                <input type="text" value={percentiles} onChange={e => setPercentiles(e.target.value)} placeholder="0.5, 0.95, 0.99" />
              </div>
            )}
          </div>

          {/* Section: Label Filters */}
          <div className="editor-section">
            <div className="editor-section-title">
              Label Filters
              {Object.keys(labelFilters).length > 0 && (
                <span className="editor-section-badge">{Object.keys(labelFilters).length}</span>
              )}
            </div>
            <LabelInput
              metric={metric}
              target={target}
              labelNames={availableLabels}
              value={labelFilters}
              onChange={setLabelFilters}
            />
            <div className="form-group" style={{marginTop: 8}}>
              <label>Legend Format</label>
              <input type="text" value={labelDisplay} onChange={e => setLabelDisplay(e.target.value)} placeholder="e.g. {{method}} {{path}}  or  method, path" />
              <span style={{fontSize: 11, color: 'var(--text-muted)'}}>Use {'{{label}}'} for templates, or comma-separated keys</span>
            </div>
          </div>

          {/* Section: Y-Axis */}
          <div className="editor-section">
            <div className="editor-section-title">Y-Axis</div>
            <div className="form-row">
              <div className="form-group">
                <label>Unit</label>
                <select value={unit} onChange={e => setUnit(e.target.value)}>
                  <option value="">None</option>
                  <option value="seconds">Seconds</option>
                  <option value="bytes">Bytes</option>
                  <option value="percent">Percent</option>
                  <option value="ops/s">Ops/s</option>
                </select>
              </div>
              <div className="form-group">
                <label>Min</label>
                <input type="text" value={yMin} onChange={e => setYMin(e.target.value)} placeholder="auto" />
              </div>
              <div className="form-group">
                <label>Max</label>
                <input type="text" value={yMax} onChange={e => setYMax(e.target.value)} placeholder="auto" />
              </div>
              <div className="form-group">
                <label>Side</label>
                <select value={ySide} onChange={e => setYSide(Number(e.target.value))}>
                  <option value={1}>Left</option>
                  <option value={2}>Right</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Layout */}
          <div className="editor-section">
            <div className="editor-section-title">Layout</div>
            <div className="form-row">
              <div className="form-group">
                <label>Width</label>
                <select value={gridW} onChange={e => setGridW(Number(e.target.value))}>
                  <option value={3}>Quarter (3/12)</option>
                  <option value={4}>Third (4/12)</option>
                  <option value={6}>Half (6/12)</option>
                  <option value={8}>Two-thirds (8/12)</option>
                  <option value={12}>Full (12/12)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Height</label>
                <select value={gridH} onChange={e => setGridH(Number(e.target.value))}>
                  <option value={1}>Short</option>
                  <option value={2}>Default</option>
                  <option value={3}>Tall</option>
                  <option value={4}>Extra Tall</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Apply</button>
        </div>
      </div>
    </div>
  )
}
