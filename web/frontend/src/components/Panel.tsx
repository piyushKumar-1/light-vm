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

  return (
    <div className="panel">
      <div className="panel-title">{panel.title}</div>
      <div className="panel-body">
        {!hasData ? (
          <div className="no-data">No data</div>
        ) : alignedData ? (
          <Chart
            data={alignedData}
            series={seriesCfg}
            yAxisUnit={panel.y_axis?.unit || ''}
            yMin={panel.y_axis?.min}
            yMax={panel.y_axis?.max}
            yAxisSide={panel.y_axis?.side}
          />
        ) : null}
      </div>
    </div>
  )
}
