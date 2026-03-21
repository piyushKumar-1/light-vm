import { useState, useEffect, useCallback } from 'react'
import { getDashboard } from '../api/client'
import type { Dashboard } from '../api/types'
import { DashboardView } from '../components/DashboardView'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { parseDurationSeconds } from '../lib/format'

interface DashboardViewPageProps {
  id: string
  navigate: (hash: string) => void
}

export function DashboardViewPage({ id, navigate }: DashboardViewPageProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [paused, setPaused] = useState(false)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    getDashboard(id)
      .then(setDashboard)
      .catch(e => setError(e.message))
  }, [id])

  const handleRefresh = useCallback(() => {
    setSpinning(true)
    setRefreshKey(k => k + 1)
    setTimeout(() => setSpinning(false), 600)
  }, [])

  if (error) return <div className="error">Failed to load dashboard: {error}</div>
  if (!dashboard) {
    return (
      <div className="view-page">
        <div className="view-skeleton">
          <div className="skeleton-bar skeleton-title" />
          <div className="skeleton-bar skeleton-toolbar" />
          <div className="skeleton-panels">
            <div className="skeleton-panel" />
            <div className="skeleton-panel" />
          </div>
        </div>
      </div>
    )
  }

  const effectiveTimeRange = timeRange ?? parseDurationSeconds(dashboard.config.time_range)

  return (
    <div className="view-page fade-in">
      <div className="view-toolbar">
        <div className="view-toolbar-left">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => navigate('#/')} title="Back to dashboards">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="view-breadcrumb">
            <span className="view-breadcrumb-root" onClick={() => navigate('#/')}>Dashboards</span>
            <span className="view-breadcrumb-sep">/</span>
            <h2>{dashboard.name}</h2>
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
          <button className="btn btn-sm" onClick={() => navigate(`#/edit/${id}`)}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            Edit
          </button>
        </div>
      </div>
      <DashboardView
        key={`${id}-${refreshKey}`}
        dashboard={dashboard}
        timeRangeOverride={timeRange ?? undefined}
        paused={paused}
      />
    </div>
  )
}
