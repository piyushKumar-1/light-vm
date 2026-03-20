import { useState, useEffect } from 'react'
import { getDashboard } from '../api/client'
import type { Dashboard } from '../api/types'
import { DashboardView } from '../components/DashboardView'
import { parseDurationSeconds } from '../lib/format'

const TIME_RANGES = [
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
  { label: '3h', value: 10800 },
  { label: '6h', value: 21600 },
  { label: '12h', value: 43200 },
  { label: '24h', value: 86400 },
]

interface DashboardViewPageProps {
  id: string
  navigate: (hash: string) => void
}

export function DashboardViewPage({ id, navigate }: DashboardViewPageProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    getDashboard(id)
      .then(setDashboard)
      .catch(e => setError(e.message))
  }, [id])

  if (error) return <div className="error">Failed to load dashboard: {error}</div>
  if (!dashboard) return <div className="loading">Loading...</div>

  const effectiveTimeRange = timeRange ?? parseDurationSeconds(dashboard.config.time_range)

  return (
    <div className="view-page">
      <div className="view-toolbar">
        <div className="view-toolbar-left">
          <button className="btn btn-sm" onClick={() => navigate('#/')}>&#8592; Back</button>
          <h2>{dashboard.name}</h2>
          {dashboard.description && <span className="view-desc">{dashboard.description}</span>}
        </div>
        <div className="view-toolbar-right">
          <select
            className="time-select"
            value={effectiveTimeRange}
            onChange={e => setTimeRange(Number(e.target.value))}
          >
            {TIME_RANGES.map(tr => (
              <option key={tr.value} value={tr.value}>{tr.label}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setRefreshKey(k => k + 1)} title="Refresh">&#x21bb;</button>
          <button className="btn btn-sm" onClick={() => navigate(`#/edit/${id}`)}>Edit</button>
        </div>
      </div>
      <DashboardView
        key={`${id}-${refreshKey}`}
        dashboard={dashboard}
        timeRangeOverride={timeRange ?? undefined}
        paused={false}
      />
    </div>
  )
}
