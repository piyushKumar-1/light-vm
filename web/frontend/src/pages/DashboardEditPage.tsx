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
    // Find next available Y position
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
      // Preserve existing grid_pos if the editor doesn't provide one
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

  if (loading) return <div className="loading">Loading...</div>

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
    <div className="edit-page">
      <div className="edit-toolbar">
        <button className="btn btn-sm" onClick={() => navigate(id ? `#/view/${id}` : '#/')}>
          &#8592; Cancel
        </button>
        <h2>{id ? 'Edit Dashboard' : 'New Dashboard'}</h2>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {error && <div className="edit-error">{error}</div>}

      <div className="edit-form">
        <div className="form-group">
          <label>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Dashboard name" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>UI Refresh</label>
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

      <div className="panels-section">
        <div className="panels-header">
          <h3>Panels ({config.panels.length})</h3>
          <button className="btn btn-sm btn-primary" onClick={addPanel}>+ Add Panel</button>
        </div>

        {config.panels.length === 0 ? (
          <div className="empty-state">
            <p>No panels yet. Add a panel to start building your dashboard.</p>
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
                    <span className="grid-panel-drag" title="Drag to reposition">&#9776;</span>
                    <span className="grid-panel-title">{panel.title}</span>
                    <span className="grid-panel-size">
                      {panel.grid_pos?.w}x{panel.grid_pos?.h}
                    </span>
                    <div className="grid-panel-actions">
                      <button className="btn btn-xs" onClick={() => setEditingPanel(i)}>Edit</button>
                      <button className="btn btn-xs btn-danger" onClick={() => removePanel(i)}>Remove</button>
                    </div>
                  </div>
                  <div className="grid-panel-meta">
                    {panel.query.metric || 'no metric'} &middot; {panel.query.type} &middot; {panel.query.target || 'all targets'}
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
