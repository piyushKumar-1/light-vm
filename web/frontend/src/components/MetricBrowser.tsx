import { useState, useEffect, useRef } from 'react'
import { getMetrics } from '../api/client'
import type { MetricMeta } from '../api/types'

interface MetricBrowserProps {
  value: string
  onChange: (metric: string, meta?: MetricMeta) => void
  target?: string
}

export function MetricBrowser({ value, onChange, target }: MetricBrowserProps) {
  const [metrics, setMetrics] = useState<MetricMeta[]>([])
  const [filter, setFilter] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMetrics(target).then(setMetrics).catch(() => {})
  }, [target])

  const filtered = metrics.filter(m =>
    m.name.toLowerCase().includes(filter.toLowerCase()),
  )

  const select = (m: MetricMeta) => {
    setFilter(m.name)
    onChange(m.name, m)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && filtered[highlighted]) {
      e.preventDefault()
      select(filtered[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (listRef.current && highlighted >= 0) {
      const el = listRef.current.children[highlighted] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted])

  return (
    <div className="metric-browser">
      <input
        ref={inputRef}
        type="text"
        value={filter}
        onChange={e => {
          setFilter(e.target.value)
          onChange(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder="Search metrics..."
      />
      {open && filtered.length > 0 && (
        <div className="metric-dropdown" ref={listRef}>
          {filtered.slice(0, 50).map((m, i) => (
            <div
              key={`${m.name}-${m.target}`}
              className={`metric-item ${i === highlighted ? 'highlighted' : ''}`}
              onMouseDown={() => select(m)}
            >
              <span className="metric-name">{m.name}</span>
              <span className="metric-type">{m.type}</span>
              {m.target && <span className="metric-target">{m.target}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
