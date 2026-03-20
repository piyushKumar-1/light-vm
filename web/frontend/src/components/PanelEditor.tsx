import { useState } from 'react'
import type { PanelConfig } from '../api/types'
import { MetricBrowser } from './MetricBrowser'

interface PanelEditorProps {
  panel: PanelConfig
  onSave: (panel: PanelConfig) => void
  onCancel: () => void
}

export function PanelEditor({ panel, onSave, onCancel }: PanelEditorProps) {
  const [title, setTitle] = useState(panel.title)
  const [metric, setMetric] = useState(panel.query.metric)
  const [queryType, setQueryType] = useState(panel.query.type)
  const [target, setTarget] = useState(panel.query.target)
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

  const handleSave = () => {
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
        label_display: labelDisplay
          ? labelDisplay.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      },
      y_axis: {
        unit,
        min: yMin ? parseFloat(yMin) : undefined,
        max: yMax ? parseFloat(yMax) : undefined,
        side: ySide,
      },
    }
    onSave(p)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Panel</h3>
          <button className="btn btn-sm" onClick={onCancel}>&#10005;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Metric</label>
            <MetricBrowser value={metric} onChange={m => setMetric(m)} target={target} />
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
              <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="* for all" />
            </div>
          </div>
          {(queryType === 'histogram' || queryType === 'summary') && (
            <div className="form-group">
              <label>Percentiles (comma-separated)</label>
              <input type="text" value={percentiles} onChange={e => setPercentiles(e.target.value)} placeholder="0.5, 0.95, 0.99" />
            </div>
          )}
          <div className="form-group">
            <label>Label Display (comma-separated)</label>
            <input type="text" value={labelDisplay} onChange={e => setLabelDisplay(e.target.value)} placeholder="e.g. quantile, method" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Y-Axis Unit</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}>
                <option value="">None</option>
                <option value="seconds">Seconds</option>
                <option value="bytes">Bytes</option>
                <option value="percent">Percent</option>
                <option value="ops/s">Ops/s</option>
              </select>
            </div>
            <div className="form-group">
              <label>Y Min</label>
              <input type="text" value={yMin} onChange={e => setYMin(e.target.value)} placeholder="auto" />
            </div>
            <div className="form-group">
              <label>Y Max</label>
              <input type="text" value={yMax} onChange={e => setYMax(e.target.value)} placeholder="auto" />
            </div>
            <div className="form-group">
              <label>Y Side</label>
              <select value={ySide} onChange={e => setYSide(Number(e.target.value))}>
                <option value={1}>Left</option>
                <option value={2}>Right</option>
              </select>
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
