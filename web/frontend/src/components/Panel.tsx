import { useRef, useState, useEffect } from 'react'
import type { PanelConfig } from '../api/types'
import { useIncrementalData } from '../hooks/useIncrementalData'
import { Chart } from './Chart'

interface PanelProps {
  panel: PanelConfig
  timeRangeSeconds: number
  refreshMs: number
  rescrapeMs: number
  paused: boolean
}

export function Panel({ panel, timeRangeSeconds, refreshMs, rescrapeMs, paused }: PanelProps) {
  const { alignedData, seriesCfg, hasData } = useIncrementalData(
    panel.query,
    timeRangeSeconds,
    refreshMs,
    rescrapeMs,
    paused,
  )

  const bodyRef = useRef<HTMLDivElement>(null)
  const [chartHeight, setChartHeight] = useState(280)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.floor(entry.contentRect.height)
        if (h > 50) setChartHeight(h)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const isLoading = !hasData && !alignedData

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{panel.title}</span>
        {panel.query.type && (
          <span className="panel-type-badge">{panel.query.type}</span>
        )}
      </div>
      <div className="panel-body" ref={bodyRef}>
        {isLoading ? (
          <div className="panel-skeleton">
            <div className="skeleton-chart">
              <div className="skeleton-line" style={{height: '40%', animationDelay: '0ms'}} />
              <div className="skeleton-line" style={{height: '65%', animationDelay: '100ms'}} />
              <div className="skeleton-line" style={{height: '35%', animationDelay: '200ms'}} />
              <div className="skeleton-line" style={{height: '80%', animationDelay: '300ms'}} />
              <div className="skeleton-line" style={{height: '50%', animationDelay: '400ms'}} />
              <div className="skeleton-line" style={{height: '70%', animationDelay: '500ms'}} />
              <div className="skeleton-line" style={{height: '45%', animationDelay: '600ms'}} />
              <div className="skeleton-line" style={{height: '60%', animationDelay: '700ms'}} />
            </div>
          </div>
        ) : hasData && alignedData ? (
          <Chart
            data={alignedData}
            series={seriesCfg}
            yAxisUnit={panel.y_axis?.unit || ''}
            yMin={panel.y_axis?.min}
            yMax={panel.y_axis?.max}
            yAxisSide={panel.y_axis?.side}
            height={chartHeight}
          />
        ) : (
          <div className="no-data">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity="0.4">
              <path d="M3 17l4-6 4 3 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="7" r="2" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>No data available</span>
          </div>
        )}
      </div>
    </div>
  )
}
