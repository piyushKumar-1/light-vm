import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { formatValue } from '../lib/format'

interface ChartProps {
  data: uPlot.AlignedData
  series: uPlot.Series[]
  yAxisUnit: string
  yMin?: number
  yMax?: number
  yAxisSide?: number // 1=left, 2=right
  height?: number
  onUplotReady?: (u: uPlot | null) => void
  onZoomSelect?: (startSec: number, endSec: number) => void
}

export function Chart({ data, series, yAxisUnit, yMin, yMax, yAxisSide = 1, height = 280, onUplotReady, onZoomSelect }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)
  const prevSeriesLenRef = useRef(0)
  const prevHeightRef = useRef(height)
  const onZoomSelectRef = useRef(onZoomSelect)
  onZoomSelectRef.current = onZoomSelect

  // Main data/series effect
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const w = el.clientWidth
    // Defer creation if container has no width yet (grid layout not positioned)
    if (w === 0) {
      const raf = requestAnimationFrame(() => {
        if (containerRef.current && containerRef.current.clientWidth > 0) {
          prevSeriesLenRef.current = -1
        }
      })
      return () => cancelAnimationFrame(raf)
    }

    // If series count changed or no instance yet, (re)create
    if (uplotRef.current && series.length === prevSeriesLenRef.current) {
      if (prevHeightRef.current !== height) {
        prevHeightRef.current = height
        uplotRef.current.setSize({ width: w, height })
      }
      uplotRef.current.setData(data)
      return
    }

    // Destroy old instance if series count changed
    if (uplotRef.current) {
      uplotRef.current.destroy()
      uplotRef.current = null
      onUplotReady?.(null)
    }

    prevSeriesLenRef.current = series.length
    prevHeightRef.current = height

    // uPlot side: 3=left, 1=right
    const side = yAxisSide === 2 ? 1 : 3

    // Add subtle area fill to the first data series
    const enhancedSeries = series.map((s, i) => {
      if (i === 0) return s
      if (i === 1 && s.stroke) {
        let fillColor: string
        if (typeof s.stroke === 'string') {
          const hex = s.stroke
          if (hex.startsWith('#') && hex.length >= 7) {
            const r = parseInt(hex.slice(1, 3), 16)
            const g = parseInt(hex.slice(3, 5), 16)
            const b = parseInt(hex.slice(5, 7), 16)
            fillColor = `rgba(${r}, ${g}, ${b}, 0.08)`
          } else if (hex.startsWith('rgb(')) {
            fillColor = hex.replace('rgb(', 'rgba(').replace(')', ', 0.08)')
          } else {
            fillColor = 'rgba(88, 166, 255, 0.08)'
          }
        } else {
          fillColor = 'rgba(88, 166, 255, 0.08)'
        }
        return { ...s, fill: fillColor }
      }
      return s
    })

    const opts: uPlot.Options = {
      width: w,
      height,
      legend: { show: false },
      focus: { alpha: 0.3 },
      series: enhancedSeries,
      axes: [
        {
          stroke: 'rgba(139, 148, 158, 0.6)',
          grid: { stroke: 'rgba(48, 54, 61, 0.4)', width: 1 },
          ticks: { stroke: 'rgba(48, 54, 61, 0.6)', width: 1 },
        },
        {
          label: yAxisUnit,
          side,
          size: 60,
          stroke: 'rgba(139, 148, 158, 0.6)',
          grid: { stroke: 'rgba(48, 54, 61, 0.4)', width: 1 },
          ticks: { stroke: 'rgba(48, 54, 61, 0.6)', width: 1 },
          values: (_u: uPlot, vals: number[]) =>
            vals.map(v => formatValue(v, yAxisUnit)),
        },
      ],
      scales: {
        y: {
          min: yMin ?? undefined,
          max: yMax ?? undefined,
        },
      },
      cursor: {
        sync: { key: 'lvm', setSeries: false, scales: ['x', null] },
        drag: { x: true, y: false, setScale: false },
      },
      hooks: {
        setSelect: [
          (u: uPlot) => {
            const sel = u.select
            if (sel.width < 10) return // ignore tiny accidental drags
            const startSec = u.posToVal(sel.left, 'x')
            const endSec = u.posToVal(sel.left + sel.width, 'x')
            // Clear the visual selection box
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
            if (onZoomSelectRef.current && endSec > startSec) {
              onZoomSelectRef.current(startSec, endSec)
            }
          },
        ],
      },
    }

    uplotRef.current = new uPlot(opts, data, el)
    onUplotReady?.(uplotRef.current)

    return () => {
      // Don't destroy here — we manage lifecycle above
    }
  }, [data, series, yAxisUnit, yMin, yMax, yAxisSide, height])

  // Handle resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        if (w > 0 && uplotRef.current) {
          uplotRef.current.setSize({ width: w, height })
        }
        if (w > 0 && !uplotRef.current) {
          prevSeriesLenRef.current = -1
        }
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [height])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (uplotRef.current) {
        uplotRef.current.destroy()
        uplotRef.current = null
        onUplotReady?.(null)
      }
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%' }} />
}
