import { useState, useEffect } from 'react'
import { getLabelValues } from '../api/client'

interface LabelInputProps {
  metric: string
  target: string
  labelNames: string[]
  value: Record<string, string[]>
  onChange: (labels: Record<string, string[]>) => void
}

export function LabelInput({ metric, target, labelNames, value, onChange }: LabelInputProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [labelValues, setLabelValues] = useState<string[]>([])
  const [loadingValues, setLoadingValues] = useState(false)
  const [filter, setFilter] = useState('')

  // Fetch values when active label changes
  useEffect(() => {
    if (!activeLabel || !metric) {
      setLabelValues([])
      return
    }
    setLoadingValues(true)
    setFilter('')
    getLabelValues(metric, target, activeLabel)
      .then(setLabelValues)
      .catch(() => setLabelValues([]))
      .finally(() => setLoadingValues(false))
  }, [activeLabel, metric, target])

  const toggleValue = (label: string, val: string) => {
    const current = value[label] || []
    if (current.includes(val)) {
      const next = current.filter(v => v !== val)
      if (next.length === 0) {
        const copy = { ...value }
        delete copy[label]
        onChange(copy)
      } else {
        onChange({ ...value, [label]: next })
      }
    } else {
      onChange({ ...value, [label]: [...current, val] })
    }
  }

  const removeTag = (label: string, val: string) => {
    toggleValue(label, val)
  }

  const removeAllForLabel = (label: string) => {
    const copy = { ...value }
    delete copy[label]
    onChange(copy)
  }

  // All tags as flat list
  const tags = Object.entries(value).flatMap(([k, vals]) =>
    vals.map(v => ({ label: k, value: v })),
  )

  // Filtered values for the active label
  const filteredValues = filter
    ? labelValues.filter(v => v.toLowerCase().includes(filter.toLowerCase()))
    : labelValues

  const selectedForActive = activeLabel ? (value[activeLabel] || []) : []

  return (
    <div className="label-input">
      {/* Selected filter tags */}
      {tags.length > 0 && (
        <div className="label-input-tags">
          {Object.entries(value).map(([k, vals]) => (
            <span key={k} className="label-tag-group">
              <span className="label-tag-key">{k}</span>
              <span className="label-tag-eq">=</span>
              {vals.map(v => (
                <span key={v} className="label-tag-val">
                  {v}
                  <button
                    className="label-tag-remove"
                    onClick={() => removeTag(k, v)}
                    type="button"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {vals.length > 1 && (
                <button
                  className="label-tag-remove-all"
                  onClick={() => removeAllForLabel(k)}
                  type="button"
                  title={`Remove all ${k} filters`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Available labels */}
      {labelNames.length > 0 && (
        <div className="label-available">
          <div className="label-available-title">Labels</div>
          {labelNames.map(l => {
            const count = value[l]?.length || 0
            return (
              <button
                key={l}
                type="button"
                className={`label-available-chip ${activeLabel === l ? 'active' : ''} ${count > 0 ? 'has-filter' : ''}`}
                onClick={() => setActiveLabel(activeLabel === l ? null : l)}
              >
                {l}
                {count > 0 && <span className="label-chip-count">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Values panel for the active label */}
      {activeLabel && (
        <div className="label-values-panel">
          <div className="label-values-header">
            <span className="label-values-title">
              Values for <strong>{activeLabel}</strong>
            </span>
            {labelValues.length > 5 && (
              <input
                type="text"
                className="label-values-filter"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter values..."
              />
            )}
          </div>
          <div className="label-values-list">
            {loadingValues ? (
              <span className="label-values-loading">Loading...</span>
            ) : filteredValues.length === 0 ? (
              <span className="label-values-empty">No values found</span>
            ) : (
              filteredValues.map(v => {
                const selected = selectedForActive.includes(v)
                return (
                  <button
                    key={v}
                    type="button"
                    className={`label-value-chip ${selected ? 'selected' : ''}`}
                    onClick={() => toggleValue(activeLabel, v)}
                  >
                    <span className="label-value-check">
                      {selected ? (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.3" opacity="0.3"/></svg>
                      )}
                    </span>
                    {v}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
