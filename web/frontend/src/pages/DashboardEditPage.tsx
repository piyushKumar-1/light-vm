import { useState, useEffect } from 'react'
import { getDashboard, createDashboard, updateDashboard } from '../api/client'
import type { Dashboard, DashboardBody, PanelConfig } from '../api/types'
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

  useEffect(() => {
    if (!id) return
    getDashboard(id)
      .then(d => {
        setName(d.name)
        setDescription(d.description)
        setConfig(d.config)
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
    const panel: PanelConfig = {
      title: 'New Panel',
      type: 'timeseries',
      query: { metric: '', type: 'gauge', target: '' },
      y_axis: { unit: '' },
    }
    setConfig(prev => ({ ...prev, panels: [...prev.panels, panel] }))
    setEditingPanel(config.panels.length)
  }

  const updatePanel = (index: number, panel: PanelConfig) => {
    setConfig(prev => {
      const panels = [...prev.panels]
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

  const movePanel = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= config.panels.length) return
    setConfig(prev => {
      const panels = [...prev.panels]
      ;[panels[index], panels[target]] = [panels[target], panels[index]]
      return { ...prev, panels }
    })
  }

  if (loading) return <div className="loading">Loading...</div>

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
          <div className="panel-list">
            {config.panels.map((panel, i) => (
              <div key={i} className="panel-list-item">
                <div className="panel-list-info" onClick={() => setEditingPanel(i)}>
                  <span className="panel-list-title">{panel.title}</span>
                  <span className="panel-list-meta">
                    {panel.query.metric || 'no metric'} &middot; {panel.query.type} &middot; {panel.query.target || 'all targets'}
                  </span>
                </div>
                <div className="panel-list-actions">
                  <button className="btn btn-xs" onClick={() => movePanel(i, -1)} disabled={i === 0}>&#8593;</button>
                  <button className="btn btn-xs" onClick={() => movePanel(i, 1)} disabled={i === config.panels.length - 1}>&#8595;</button>
                  <button className="btn btn-xs" onClick={() => setEditingPanel(i)}>Edit</button>
                  <button className="btn btn-xs btn-danger" onClick={() => removePanel(i)}>Remove</button>
                </div>
              </div>
            ))}
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
