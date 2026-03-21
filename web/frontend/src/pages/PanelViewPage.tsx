import { useState, useEffect, useCallback } from 'react'
import { getDashboard, updateDashboard } from '../api/client'
import type { Dashboard } from '../api/types'
import { Panel } from '../components/Panel'
import { PanelEditor } from '../components/PanelEditor'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { parseDuration, parseDurationSeconds } from '../lib/format'

interface PanelViewPageProps {
  dashboardId: string
  panelIdx: number
  navigate: (hash: string) => void
}

export function PanelViewPage({ dashboardId, panelIdx, navigate }: PanelViewPageProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    getDashboard(dashboardId)
      .then(setDashboard)
      .catch(e => setError(e.message))
  }, [dashboardId])

  const handleRefresh = useCallback(() => {
    setSpinning(true)
    setRefreshKey(k => k + 1)
    setTimeout(() => setSpinning(false), 600)
  }, [])

  const handleSavePanel = async (panel: typeof dashboard extends null ? never : Dashboard['config']['panels'][0]) => {
    if (!dashboard) return
    const panels = [...dashboard.config.panels]
    if (!panel.grid_pos && panels[panelIdx]?.grid_pos) {
      panel = { ...panel, grid_pos: panels[panelIdx].grid_pos }
    }
    panels[panelIdx] = panel
    const newConfig = { ...dashboard.config, panels }
    try {
      await updateDashboard(dashboardId, { config: newConfig })
      setDashboard({ ...dashboard, config: newConfig })
      setEditing(false)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (error) return <div className="error">Error: {error}</div>
  if (!dashboard) {
    return (
      <div className="view-page">
        <div className="view-skeleton">
          <div className="skeleton-bar skeleton-title" />
          <div className="skeleton-bar" style={{height: 400}} />
        </div>
      </div>
    )
  }

  const panel = dashboard.config.panels[panelIdx]
  if (!panel) return <div className="error">Panel not found</div>

  const effectiveTimeRange = timeRange ?? parseDurationSeconds(dashboard.config.time_range)
  const refreshMs = parseDuration(dashboard.config.ui_refresh)
  const rescrapeMs = parseDuration(dashboard.config.rescrape_interval)

  return (
    <div className="view-page fade-in">
      <div className="view-toolbar">
        <div className="view-toolbar-left">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => navigate(`#/view/${dashboardId}`)} title="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="view-breadcrumb">
            <span className="view-breadcrumb-root" onClick={() => navigate('#/')}>Dashboards</span>
            <span className="view-breadcrumb-sep">/</span>
            <span className="view-breadcrumb-root" onClick={() => navigate(`#/view/${dashboardId}`)}>{dashboard.name}</span>
            <span className="view-breadcrumb-sep">/</span>
            <h2>{panel.title}</h2>
          </div>
        </div>
        <div className="view-toolbar-center">
          <TimeRangePicker value={effectiveTimeRange} onChange={setTimeRange} />
        </div>
        <div className="view-toolbar-right">
          <button
            className={`btn btn-ghost btn-sm btn-icon ${spinning ? 'spin-once' : ''}`}
            onClick={handleRefresh}
            title="Refresh"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z" fill="currentColor" opacity="0.9"/></svg>
          </button>
          <button
            className={`btn btn-sm ${paused ? 'btn-paused' : 'btn-ghost'}`}
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2l10 6-10 6V2z" fill="currentColor"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/><rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/></svg>
            )}
          </button>
          {!paused && <span className="auto-refresh-dot" title="Auto-refreshing" />}
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            Edit
          </button>
        </div>
      </div>
      <div className="panel-focus" key={refreshKey}>
        <Panel
          panel={panel}
          timeRangeSeconds={effectiveTimeRange}
          refreshMs={refreshMs}
          rescrapeMs={rescrapeMs}
          paused={paused}
        />
      </div>
      {editing && (
        <PanelEditor
          panel={panel}
          onSave={handleSavePanel}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
