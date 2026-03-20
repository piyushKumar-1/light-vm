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
}

export function Chart({ data, series, yAxisUnit, yMin, yMax, yAxisSide = 1, height = 280 }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)
  const prevSeriesLenRef = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // If series count changed or no instance yet, (re)create
    if (uplotRef.current && series.length === prevSeriesLenRef.current) {
      // Just update data — no flicker
      uplotRef.current.setData(data)
      return
    }

    // Destroy old instance if series count changed
    if (uplotRef.current) {
      uplotRef.current.destroy()
      uplotRef.current = null
    }

    prevSeriesLenRef.current = series.length

    // uPlot side: 3=left, 1=right
    const side = yAxisSide === 2 ? 1 : 3

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      series,
      axes: [
        {},
        {
          label: yAxisUnit,
          side,
          size: 60,
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
      },
    }

    uplotRef.current = new uPlot(opts, data, el)

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
        if (uplotRef.current) {
          uplotRef.current.setSize({
            width: entry.contentRect.width,
            height,
          })
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
      }
    }
  }, [])

  return <div ref={containerRef} />
}
