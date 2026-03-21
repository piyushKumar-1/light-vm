import { useState, useRef, useEffect } from 'react'

const PRESETS = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '3h', seconds: 10800 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '1d', seconds: 86400 },
  { label: '3d', seconds: 259200 },
  { label: '7d', seconds: 604800 },
]

interface TimeRangePickerProps {
  value: number // seconds
  onChange: (seconds: number) => void
}

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isPreset = PRESETS.some(p => p.seconds === value)

  // Format a date for datetime-local input
  const toLocalISO = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const now = new Date()
  const defaultStart = toLocalISO(new Date(now.getTime() - value * 1000))
  const defaultEnd = toLocalISO(now)
  const [customStart, setCustomStart] = useState(defaultStart)
  const [customEnd, setCustomEnd] = useState(defaultEnd)

  // Close popover on click outside
  useEffect(() => {
    if (!showCustom) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCustom])

  const applyCustom = () => {
    const s = new Date(customStart).getTime() / 1000
    const e = new Date(customEnd).getTime() / 1000
    if (e > s) {
      onChange(Math.round(e - s))
      setShowCustom(false)
    }
  }

  return (
    <div className="time-picker">
      <div className="time-picker-pills">
        {PRESETS.map(p => (
          <button
            key={p.seconds}
            className={`time-pill ${value === p.seconds ? 'active' : ''}`}
            onClick={() => { onChange(p.seconds); setShowCustom(false) }}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`time-pill ${!isPreset ? 'active' : ''}`}
          onClick={() => setShowCustom(!showCustom)}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div className="time-picker-popover" ref={popoverRef}>
          <div className="time-picker-field">
            <label>From</label>
            <input
              type="datetime-local"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
            />
          </div>
          <div className="time-picker-field">
            <label>To</label>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={applyCustom}>Apply</button>
        </div>
      )}
    </div>
  )
}
