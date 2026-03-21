import { useCallback, useEffect, useRef, useState } from 'react'
import { queryRange } from '../api/client'
import type { QueryConfig } from '../api/types'
import { mergeSeriesData, bufferedToAligned, COLORS, buildLabel } from '../lib/chartHelpers'
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
  rescrapeMs: number,
  paused: boolean,
): IncrementalDataResult {
  const bufferRef = useRef(
    new Map<string, { labels: Record<string, string>; points: Map<number, number> }>(),
  )
  const lastTsRef = useRef<number | undefined>(undefined)
  const lastFullFetchRef = useRef<number>(0)

  const [alignedData, setAlignedData] = useState<uPlot.AlignedData | null>(null)
  const [seriesCfg, setSeriesCfg] = useState<uPlot.Series[]>([{}]) // x-axis placeholder
  const [hasData, setHasData] = useState(false)

  const fetchAndMerge = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000)
    const windowStart = now - timeRangeSeconds

    // Full rescrape: clear buffer periodically to avoid stale data accumulation
    const rescrapeSeconds = rescrapeMs / 1000
    const needsFullRefetch = (now - lastFullFetchRef.current) >= rescrapeSeconds
    if (needsFullRefetch) {
      bufferRef.current = new Map()
      lastTsRef.current = undefined
      lastFullFetchRef.current = now
    }

    const start = lastTsRef.current !== undefined ? lastTsRef.current : windowStart
    const end = now

    // Compute step: for ranges > 1h, aim for ~1000 data points
    const rangeSec = timeRangeSeconds
    let step: number | undefined
    if (rangeSec > 3600) {
      step = Math.max(5, rangeSec / 1000)
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
        lastTsRef.current, // since parameter for incremental
        step,
      )

      const trimBefore = now - timeRangeSeconds
      mergeSeriesData(bufferRef.current, resp.series, trimBefore)

      // Track latest timestamp
      for (const s of resp.series) {
        for (const [ts] of s.datapoints) {
          if (lastTsRef.current === undefined || ts > lastTsRef.current) {
            lastTsRef.current = ts
          }
        }
      }

      // Build aligned data
      const { data, keys, labelsMap } = bufferedToAligned(bufferRef.current)

      if (data[0].length > 0) {
        setAlignedData(data as uPlot.AlignedData)
        setHasData(true)

        // Rebuild series config if key count changed
        const newSeries: uPlot.Series[] = [{}]
        keys.forEach((key, i) => {
          const labels = labelsMap.get(key) || {}
          newSeries.push({
            label: buildLabel(labels, query.label_display),
            stroke: COLORS[i % COLORS.length],
            width: 2,
          })
        })
        setSeriesCfg(newSeries)
      }
    } catch {
      // Silently ignore fetch errors to keep showing stale data
    }
  }, [query, timeRangeSeconds, rescrapeMs])

  // Reset buffer when query changes
  useEffect(() => {
    bufferRef.current = new Map()
    lastTsRef.current = undefined
    lastFullFetchRef.current = 0
    setAlignedData(null)
    setSeriesCfg([{}])
    setHasData(false)
  }, [query.metric, query.target, query.type, JSON.stringify(query.labels)])

  // Initial fetch + interval
  useEffect(() => {
    if (paused) return

    fetchAndMerge()
    const id = setInterval(fetchAndMerge, refreshMs)
    return () => clearInterval(id)
  }, [fetchAndMerge, refreshMs, paused])

  return { alignedData, seriesCfg, hasData }
}
