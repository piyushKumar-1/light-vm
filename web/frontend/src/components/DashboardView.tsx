import type { Dashboard } from '../api/types'
import { parseDuration, parseDurationSeconds } from '../lib/format'
import { Panel } from './Panel'

interface DashboardViewProps {
  dashboard: Dashboard
  timeRangeOverride?: number // seconds, from time-range selector
  paused: boolean
}

export function DashboardView({ dashboard, timeRangeOverride, paused }: DashboardViewProps) {
  const cfg = dashboard.config
  const timeRangeSeconds = timeRangeOverride ?? parseDurationSeconds(cfg.time_range)
  const refreshMs = parseDuration(cfg.ui_refresh)
  const rescrapeMs = parseDuration(cfg.rescrape_interval)

  if (!cfg.panels || cfg.panels.length === 0) {
    return <div className="no-data">No panels configured</div>
  }

  return (
    <div className="dashboard-panels">
      {cfg.panels.map((panel, i) => (
        <Panel
          key={`${dashboard.id}-${i}-${panel.query.metric}`}
          panel={panel}
          timeRangeSeconds={timeRangeSeconds}
          refreshMs={refreshMs}
          rescrapeMs={rescrapeMs}
          paused={paused}
        />
      ))}
    </div>
  )
}
