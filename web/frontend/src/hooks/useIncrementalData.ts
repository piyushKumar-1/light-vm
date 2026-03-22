import { useEffect, useState } from 'react'
import { queryRange } from '../api/client'
import type { QueryConfig } from '../api/types'
import { alignSeries, buildLabel, COLORS } from '../lib/chartHelpers'
import type uPlot from 'uplot'

export interface IncrementalDataResult {
  alignedData: uPlot.AlignedData | null
  seriesCfg: uPlot.Series[]
  hasData: boolean
}

export function useIncrementalData(
  query: QueryConfig,
  timeRangeSeconds: number,
  refreshMs: number,
  _rescrapeMs: number,
  paused: boolean,
  absoluteRange?: { start: number; end: number },
): IncrementalDataResult {
  const [alignedData, setAlignedData] = useState<uPlot.AlignedData | null>(null)
  const [seriesCfg, setSeriesCfg] = useState<uPlot.Series[]>([{}])
  const [hasData, setHasData] = useState(false)

  const queryKey = `${query.metric}|${query.target}|${query.type}|${JSON.stringify(query.labels)}|${JSON.stringify(query.percentiles)}`
  const absKey = absoluteRange ? `${absoluteRange.start}|${absoluteRange.end}` : ''

  // Reset state when query changes
  useEffect(() => {
    setAlignedData(null)
    setSeriesCfg([{}])
    setHasData(false)
  }, [queryKey, absKey])

  // Fetch loop
  useEffect(() => {
    if (paused) return
    let cancelled = false

    const doFetch = async () => {
      let start: number, end: number
      if (absoluteRange) {
        start = Math.floor(absoluteRange.start)
        end = Math.floor(absoluteRange.end)
      } else {
        end = Math.floor(Date.now() / 1000)
        start = end - timeRangeSeconds
      }

      try {
        const resp = await queryRange(
          query.metric,
          query.target,
          start,
          end,
          query.type,
          query.labels,
          query.percentiles,
        )
        if (cancelled) return
        if (!resp.series || resp.series.length === 0) return

        const { data, seriesKeys } = alignSeries(resp.series)
        if (data[0].length === 0) return

        const cfg: uPlot.Series[] = [{}]
        for (let i = 0; i < seriesKeys.length; i++) {
          const labels: Record<string, string> = JSON.parse(seriesKeys[i])
          cfg.push({
            label: buildLabel(labels, query.label_display),
            stroke: COLORS[i % COLORS.length],
            width: 2,
          })
        }

        setAlignedData(data as uPlot.AlignedData)
        setSeriesCfg(cfg)
        setHasData(true)
      } catch (err) {
        console.error(`[light_vm] query failed for ${query.metric}:`, err)
      }
    }

    doFetch()
    // For absolute ranges (zoomed), fetch once then stop polling.
    // The data is a fixed window, re-fetching won't produce new points.
    if (!absoluteRange) {
      const id = setInterval(doFetch, refreshMs)
      return () => {
        cancelled = true
        clearInterval(id)
      }
    }
    return () => { cancelled = true }
  }, [queryKey, timeRangeSeconds, refreshMs, paused, absKey])

  return { alignedData, seriesCfg, hasData }
}
