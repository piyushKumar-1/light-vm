import { useRef, useState, useEffect, useCallback } from 'react'
import type uPlot from 'uplot'
import type { PanelConfig } from '../api/types'
import { useIncrementalData } from '../hooks/useIncrementalData'
import { Chart } from './Chart'
import { Legend } from './Legend'

interface PanelProps {
  panel: PanelConfig
  timeRangeSeconds: number
  absoluteRange?: { start: number; end: number }
  refreshMs: number
  rescrapeMs: number
  paused: boolean
  onEdit?: () => void
  onView?: () => void
  onZoomSelect?: (startSec: number, endSec: number) => void
}

export function Panel({ panel, timeRangeSeconds, absoluteRange, refreshMs, rescrapeMs, paused, onEdit, onView, onZoomSelect }: PanelProps) {
  const { alignedData, seriesCfg, hasData } = useIncrementalData(
    panel.query,
    timeRangeSeconds,
    refreshMs,
    rescrapeMs,
    paused,
    absoluteRange,
  )

  const chartAreaRef = useRef<HTMLDivElement>(null)
  const uplotInstanceRef = useRef<uPlot | null>(null)
  const [chartHeight, setChartHeight] = useState(280)

  const handleUplotReady = useCallback((u: uPlot | null) => {
    uplotInstanceRef.current = u
  }, [])

  useEffect(() => {
    const el = chartAreaRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = Math.floor(entry.contentRect.height)
        if (h > 50) setChartHeight(h)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasData])

  const isLoading = !hasData && !alignedData
  const yAxisUnit = panel.y_axis?.unit || ''

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{panel.title}</span>
        {panel.query.type && (
          <span className="panel-type-badge">{panel.query.type}</span>
        )}
        {(onView || onEdit) && (
          <div className="panel-actions">
            {onView && (
              <button className="panel-action-btn" onClick={onView} title="View panel">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v10H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/></svg>
              </button>
            )}
            {onEdit && (
              <button className="panel-action-btn" onClick={onEdit} title="Edit panel">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="panel-body">
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
          <div className="panel-chart-row">
            <div className="panel-chart-area" ref={chartAreaRef}>
              <Chart
                data={alignedData}
                series={seriesCfg}
                yAxisUnit={yAxisUnit}
                yMin={panel.y_axis?.min}
                yMax={panel.y_axis?.max}
                yAxisSide={panel.y_axis?.side}
                height={chartHeight}
                onUplotReady={handleUplotReady}
                onZoomSelect={onZoomSelect}
              />
            </div>
            {seriesCfg.length > 1 && (
              <Legend
                series={seriesCfg}
                uplotRef={uplotInstanceRef}
                data={alignedData}
                yAxisUnit={yAxisUnit}
              />
            )}
          </div>
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
