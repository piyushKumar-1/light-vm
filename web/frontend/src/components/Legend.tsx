import { useState, useCallback, useEffect, useMemo } from 'react'
import type uPlot from 'uplot'
import { formatValue } from '../lib/format'

type SortMode = 'name' | 'value-desc' | 'value-asc'

interface LegendProps {
  series: uPlot.Series[]
  uplotRef: React.RefObject<uPlot | null>
  data: uPlot.AlignedData | null
  yAxisUnit: string
}

function getLatestValue(data: uPlot.AlignedData | null, seriesIdx: number): number | null {
  if (!data || seriesIdx >= data.length) return null
  const vals = data[seriesIdx]
  if (!vals) return null
  // Walk backwards to find last non-NaN value
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i]
    if (v != null && !isNaN(v as number)) return v as number
  }
  return null
}

export function Legend({ series, uplotRef, data, yAxisUnit }: LegendProps) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('name')

  useEffect(() => {
    setFocusedIdx(null)
  }, [series.length])

  const handleClick = useCallback((seriesIdx: number) => {
    const u = uplotRef.current
    if (!u) return

    if (focusedIdx === seriesIdx) {
      setFocusedIdx(null)
      for (let i = 1; i < u.series.length; i++) {
        u.setSeries(i, { show: true })
      }
      u.setData(u.data!)
    } else {
      u.setSeries(seriesIdx, { focus: true })
      setFocusedIdx(seriesIdx)
    }
  }, [focusedIdx, uplotRef])

  const cycleSortMode = useCallback(() => {
    setSortMode(m => {
      if (m === 'name') return 'value-desc'
      if (m === 'value-desc') return 'value-asc'
      return 'name'
    })
  }, [])

  // Build sorted list of items with their latest values
  const items = useMemo(() => {
    const dataSeries = series.slice(1) // skip x-axis series
    const list = dataSeries.map((s, i) => ({
      seriesIdx: i + 1,
      label: typeof s.label === 'string' ? s.label : `Series ${i + 1}`,
      stroke: typeof s.stroke === 'string' ? s.stroke : '#888',
      value: getLatestValue(data, i + 1),
    }))

    if (sortMode === 'value-desc') {
      list.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    } else if (sortMode === 'value-asc') {
      list.sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))
    }
    // 'name' keeps the original order (already sorted by label from buildLabel)

    return list
  }, [series, data, sortMode])

  if (items.length === 0) return null

  const sortIcon = sortMode === 'name' ? 'A' : sortMode === 'value-desc' ? '\u2193' : '\u2191'

  return (
    <div className="chart-legend">
      <div className="chart-legend-header">
        <span className="chart-legend-title">Legend</span>
        <button
          className="chart-legend-sort-btn"
          onClick={cycleSortMode}
          title={`Sort: ${sortMode === 'name' ? 'by name' : sortMode === 'value-desc' ? 'value high\u2192low' : 'value low\u2192high'}`}
        >
          {sortIcon}
        </button>
      </div>
      <div className="chart-legend-items">
        {items.map(item => {
          const isFocused = focusedIdx === item.seriesIdx
          const isDimmed = focusedIdx !== null && !isFocused

          return (
            <button
              key={item.seriesIdx}
              className={`chart-legend-item${isFocused ? ' focused' : ''}${isDimmed ? ' dimmed' : ''}`}
              onClick={() => handleClick(item.seriesIdx)}
              title={item.label}
            >
              <span
                className="chart-legend-swatch"
                style={{ background: item.stroke }}
              />
              <span className="chart-legend-label">{item.label}</span>
              <span className="chart-legend-value">
                {item.value != null ? formatValue(item.value, yAxisUnit) : '-'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
