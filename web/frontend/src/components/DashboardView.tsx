import { useRef, useState, useEffect } from 'react'
import { GridLayout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import type { Dashboard } from '../api/types'
import { parseDuration, parseDurationSeconds } from '../lib/format'
import { assignDefaultGridPos } from '../lib/gridDefaults'
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

  const panels = assignDefaultGridPos(cfg.panels ?? [])

  const layout = panels.map((p, i) => ({
    i: String(i),
    x: p.grid_pos!.x,
    y: p.grid_pos!.y,
    w: p.grid_pos!.w,
    h: p.grid_pos!.h,
  }))

  if (!cfg.panels || cfg.panels.length === 0) {
    return <div className="no-data">No panels configured</div>
  }

  return (
    <div className="dashboard-panels" ref={containerRef}>
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
        dragConfig={{ enabled: false, bounded: false, threshold: 3 }}
        resizeConfig={{ enabled: false, handles: ['se'] }}
      >
        {panels.map((panel, i) => (
          <div key={String(i)}>
            <Panel
              panel={panel}
              timeRangeSeconds={timeRangeSeconds}
              refreshMs={refreshMs}
              rescrapeMs={rescrapeMs}
              paused={paused}
            />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
