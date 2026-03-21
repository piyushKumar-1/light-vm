import { useState, useEffect, useRef, useCallback } from 'react'
import { GridLayout, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { getDashboard, createDashboard, updateDashboard } from '../api/client'
import type { Dashboard, DashboardBody, PanelConfig } from '../api/types'
import { assignDefaultGridPos } from '../lib/gridDefaults'
import { PanelEditor } from '../components/PanelEditor'

interface DashboardEditPageProps {
  id?: string // undefined = new dashboard
  navigate: (hash: string) => void
}

const defaultConfig: DashboardBody = {
  ui_refresh: '5s',
  rescrape_interval: '5m0s',
  time_range: '1h0m0s',
  panels: [],
}

export function DashboardEditPage({ id, navigate }: DashboardEditPageProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState<DashboardBody>(defaultConfig)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [editingPanel, setEditingPanel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!id) return
    getDashboard(id)
      .then(d => {
        setName(d.name)
        setDescription(d.description)
        setConfig({
          ...d.config,
          panels: assignDefaultGridPos(d.config.panels),
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Partial<Dashboard> = { name, description, config }
      if (id) {
        await updateDashboard(id, payload)
        navigate(`#/view/${id}`)
      } else {
        const created = await createDashboard(payload)
        navigate(`#/view/${created.id}`)
      }
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const addPanel = () => {
    const panels = assignDefaultGridPos(config.panels)
    let maxY = 0
    for (const p of panels) {
      if (p.grid_pos) {
        const bottom = p.grid_pos.y + p.grid_pos.h
        if (bottom > maxY) maxY = bottom
      }
    }
    const panel: PanelConfig = {
      title: 'New Panel',
      type: 'timeseries',
      query: { metric: '', type: 'gauge', target: '' },
      y_axis: { unit: '' },
      grid_pos: { x: 0, y: maxY, w: 6, h: 2 },
    }
    const newPanels = [...panels, panel]
    setConfig(prev => ({ ...prev, panels: newPanels }))
    setEditingPanel(newPanels.length - 1)
  }

  const updatePanel = (index: number, panel: PanelConfig) => {
    setConfig(prev => {
      const panels = [...prev.panels]
      if (!panel.grid_pos && panels[index]?.grid_pos) {
        panel = { ...panel, grid_pos: panels[index].grid_pos }
      }
      panels[index] = panel
      return { ...prev, panels }
    })
  }

  const removePanel = (index: number) => {
    setConfig(prev => ({
      ...prev,
      panels: prev.panels.filter((_, i) => i !== index),
    }))
    setEditingPanel(null)
  }

  const handleLayoutChange = useCallback((layout: Layout) => {
    setConfig(prev => {
      const panels = [...prev.panels]
      for (const item of layout) {
        const idx = parseInt(item.i, 10)
        if (idx >= 0 && idx < panels.length) {
          panels[idx] = {
            ...panels[idx],
            grid_pos: { x: item.x, y: item.y, w: item.w, h: item.h },
          }
        }
      }
      return { ...prev, panels }
    })
  }, [])

  if (loading) {
    return (
      <div className="edit-page">
        <div className="view-skeleton">
          <div className="skeleton-bar skeleton-title" />
          <div className="skeleton-bar" style={{height: 200}} />
        </div>
      </div>
    )
  }

  const panels = assignDefaultGridPos(config.panels)

  const layout = panels.map((p, i) => ({
    i: String(i),
    x: p.grid_pos!.x,
    y: p.grid_pos!.y,
    w: p.grid_pos!.w,
    h: p.grid_pos!.h,
    minW: 2,
    minH: 1,
  }))

  return (
    <div className="edit-page fade-in">
      {/* Toolbar */}
      <div className="edit-toolbar">
        <div className="edit-toolbar-left">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => navigate(id ? `#/view/${id}` : '#/')} title="Cancel">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="view-breadcrumb">
            <span className="view-breadcrumb-root" onClick={() => navigate('#/')}>Dashboards</span>
            <span className="view-breadcrumb-sep">/</span>
            <h2>{id ? name || 'Edit' : 'New Dashboard'}</h2>
          </div>
        </div>
        <div className="edit-toolbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(id ? `#/view/${id}` : '#/')}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <><span className="login-spinner" style={{width: 12, height: 12, borderWidth: 1.5}} /> Saving...</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginRight: 2}}><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Save</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="edit-error">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginRight: 6, flexShrink: 0}}><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          {error}
        </div>
      )}

      {/* Dashboard Settings */}
      <div className="edit-section">
        <div className="edit-section-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 100 14A7 7 0 008 1z" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          Settings
        </div>
        <div className="edit-section-body">
          <div className="form-row">
            <div className="form-group" style={{flex: 2}}>
              <label>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Dashboard name" />
            </div>
            <div className="form-group" style={{flex: 3}}>
              <label>Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Refresh Interval</label>
              <input type="text" value={config.ui_refresh} onChange={e => setConfig(c => ({ ...c, ui_refresh: e.target.value }))} placeholder="5s" />
            </div>
            <div className="form-group">
              <label>Rescrape Interval</label>
              <input type="text" value={config.rescrape_interval} onChange={e => setConfig(c => ({ ...c, rescrape_interval: e.target.value }))} placeholder="5m" />
            </div>
            <div className="form-group">
              <label>Time Range</label>
              <input type="text" value={config.time_range} onChange={e => setConfig(c => ({ ...c, time_range: e.target.value }))} placeholder="1h" />
            </div>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="edit-section">
        <div className="edit-section-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.3"/><path d="M4 8h2v3H4zM7 5h2v6H7zM10 3h2v8h-2z" fill="currentColor" opacity="0.5"/></svg>
          Panels
          <span className="edit-section-badge">{config.panels.length}</span>
          <div style={{flex: 1}} />
          <button className="btn btn-primary btn-sm" onClick={addPanel}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{marginRight: 3}}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Add Panel
          </button>
        </div>

        {config.panels.length === 0 ? (
          <div className="edit-empty-panels">
            <div className="empty-icon">
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
                <path d="M24 18v12M18 24h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
              </svg>
            </div>
            <p className="empty-title">No panels yet</p>
            <p className="empty-desc">Add a panel to start building your dashboard</p>
            <button className="btn btn-primary btn-sm" onClick={addPanel}>Add your first panel</button>
          </div>
        ) : (
          <div className="grid-edit-container" ref={containerRef}>
            <GridLayout
              layout={layout}
              width={width}
              gridConfig={{
                cols: 12,
                rowHeight: 120,
                margin: [14, 14] as const,
                containerPadding: [0, 0] as const,
                maxRows: Infinity,
              }}
              dragConfig={{ enabled: true, bounded: false, handle: '.grid-panel-drag', threshold: 3 }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
              onLayoutChange={handleLayoutChange}
            >
              {panels.map((panel, i) => (
                <div key={String(i)} className="grid-edit-item">
                  <div className="grid-panel-header">
                    <span className="grid-panel-drag" title="Drag to reposition">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="1.5" fill="currentColor"/><circle cx="11" cy="4" r="1.5" fill="currentColor"/><circle cx="5" cy="8" r="1.5" fill="currentColor"/><circle cx="11" cy="8" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="11" cy="12" r="1.5" fill="currentColor"/></svg>
                    </span>
                    <span className="grid-panel-title">{panel.title}</span>
                    <span className="grid-panel-size">
                      {panel.grid_pos?.w}&times;{panel.grid_pos?.h}
                    </span>
                    <div className="grid-panel-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingPanel(i)}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-xs btn-danger" onClick={() => removePanel(i)}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8.5a.5.5 0 00.5.5h5a.5.5 0 00.5-.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="grid-panel-meta">
                    <span className="grid-panel-metric">{panel.query.metric || 'no metric'}</span>
                    <span className="grid-panel-type-badge">{panel.query.type}</span>
                    <span className="grid-panel-target">{panel.query.target || 'all'}</span>
                  </div>
                </div>
              ))}
            </GridLayout>
          </div>
        )}
      </div>

      {editingPanel !== null && config.panels[editingPanel] && (
        <PanelEditor
          panel={config.panels[editingPanel]}
          onSave={panel => {
            updatePanel(editingPanel, panel)
            setEditingPanel(null)
          }}
          onCancel={() => setEditingPanel(null)}
        />
      )}
    </div>
  )
}
