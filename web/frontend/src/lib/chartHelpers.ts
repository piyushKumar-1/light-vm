import type { TimeSeries } from '../api/types'

export const COLORS = [
  '#34d399', '#f0883e', '#60a5fa', '#f85149', '#c084fc',
  '#f778ba', '#38bdf8', '#d29922', '#7ee787', '#ffa657',
]

export function buildLabel(labels: Record<string, string>, labelDisplay?: string[]): string {
  if (labelDisplay && labelDisplay.length > 0) {
    const first = labelDisplay[0]
    // Template mode: "Requests {{method}}" or "{{instance}} - {{path}}"
    if (first.includes('{{')) {
      const result = first.replace(/\{\{(\w+)\}\}/g, (_, key) => labels[key] ?? key)
      return result || 'value'
    }
    // Key list mode: ["method", "path"] → "method=GET, path=/api"
    const parts = labelDisplay
      .filter(k => labels[k] !== undefined)
      .map(k => `${k}=${labels[k]}`)
    return parts.join(', ') || 'value'
  }
  // Default: all non-internal labels
  const keys = Object.keys(labels).filter(k => !k.startsWith('__')).sort()
  const parts = keys
    .filter(k => labels[k] !== undefined)
    .map(k => `${k}=${labels[k]}`)
  return parts.join(', ') || 'value'
}

export interface AlignedResult {
  data: (Float64Array | number[])[]
  seriesKeys: string[]
}

export function alignSeries(seriesList: TimeSeries[]): AlignedResult {
  if (seriesList.length === 0) {
    return { data: [new Float64Array(0)], seriesKeys: [] }
  }

  const tsSet = new Set<number>()
  const keyOrder: string[] = []
  const seriesByKey = new Map<string, Map<number, number>>()

  for (const s of seriesList) {
    const key = JSON.stringify(s.labels)
    if (!seriesByKey.has(key)) {
      keyOrder.push(key)
      seriesByKey.set(key, new Map())
    }
    const valueMap = seriesByKey.get(key)!
    for (const [ts, val] of s.datapoints) {
      tsSet.add(ts)
      valueMap.set(ts, val)
    }
  }

  const timestamps = Array.from(tsSet).sort((a, b) => a - b)
  const data: (Float64Array | number[])[] = [new Float64Array(timestamps)]

  for (const key of keyOrder) {
    const valueMap = seriesByKey.get(key)!
    const values = new Float64Array(timestamps.length)
    for (let j = 0; j < timestamps.length; j++) {
      const v = valueMap.get(timestamps[j])
      values[j] = v !== undefined ? v : NaN
    }
    data.push(values)
  }

  return { data, seriesKeys: keyOrder }
}

export function mergeSeriesData(
  existing: Map<string, { labels: Record<string, string>; points: Map<number, number> }>,
  incoming: TimeSeries[],
  trimBefore: number,
): Map<string, { labels: Record<string, string>; points: Map<number, number> }> {
  for (const s of incoming) {
    const key = JSON.stringify(s.labels)
    let entry = existing.get(key)
    if (!entry) {
      entry = { labels: s.labels, points: new Map() }
      existing.set(key, entry)
    }
    for (const [ts, val] of s.datapoints) {
      entry.points.set(ts, val)
    }
  }

  // Trim old points
  for (const [key, entry] of existing) {
    for (const ts of entry.points.keys()) {
      if (ts < trimBefore) {
        entry.points.delete(ts)
      }
    }
    if (entry.points.size === 0) {
      existing.delete(key)
    }
  }

  return existing
}

export function bufferedToAligned(
  buffer: Map<string, { labels: Record<string, string>; points: Map<number, number> }>,
): { data: (Float64Array | number[])[]; keys: string[]; labelsMap: Map<string, Record<string, string>> } {
  const tsSet = new Set<number>()
  const keys: string[] = []
  const labelsMap = new Map<string, Record<string, string>>()

  for (const [key, entry] of buffer) {
    keys.push(key)
    labelsMap.set(key, entry.labels)
    for (const ts of entry.points.keys()) {
      tsSet.add(ts)
    }
  }

  const timestamps = Array.from(tsSet).sort((a, b) => a - b)
  const data: (Float64Array | number[])[] = [new Float64Array(timestamps)]

  for (const key of keys) {
    const pointMap = buffer.get(key)!.points
    const values = new Float64Array(timestamps.length)
    for (let j = 0; j < timestamps.length; j++) {
      const v = pointMap.get(timestamps[j])
      values[j] = v !== undefined ? v : NaN
    }
    data.push(values)
  }

  return { data, keys, labelsMap }
}
