import { useState, useRef, useCallback } from 'react'
import { createDashboard } from '../api/client'
import { convertGrafanaDashboard } from '../lib/grafanaImport'
import type { ConversionResult } from '../lib/grafanaImport'

interface ImportDashboardModalProps {
  onComplete: (dashboardId: string) => void
  onCancel: () => void
}

export function ImportDashboardModal({ onComplete, onCancel }: ImportDashboardModalProps) {
  const [result, setResult] = useState<ConversionResult | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    setError('')
    setResult(null)

    if (!file.name.endsWith('.json')) {
      setError('Please select a .json file')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setError('Failed to read file')
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string)
        const converted = convertGrafanaDashboard(raw)
        setResult(converted)
        setName(converted.dashboard.name)
        setDescription(converted.dashboard.description)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse JSON')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleImport = async () => {
    if (!result || !name.trim()) return
    setImporting(true)
    setError('')
    try {
      const created = await createDashboard({
        name: name.trim(),
        description,
        config: result.dashboard.config,
      })
      onComplete(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setImporting(false)
    }
  }

  const panelCount = result?.dashboard.config.panels.length || 0
  const skippedCount = result?.skippedPanels.length || 0
  const warningCount = result?.warnings.length || 0

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import Dashboard</h3>
          <button className="btn btn-sm" onClick={onCancel}>&#10005;</button>
        </div>
        <div className="modal-body">
          {!result ? (
            <>
              <div
                className={`import-dropzone${dragover ? ' dragover' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragover(true) }}
                onDragLeave={() => setDragover(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                />
                <p>Drop a JSON file here or click to browse</p>
                <span>Supports Grafana dashboard exports and light_vm JSON</span>
              </div>
              {error && <div className="import-error">{error}</div>}
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Dashboard Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Dashboard name"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="import-summary">
                {panelCount} panel{panelCount !== 1 ? 's' : ''} converted
                {skippedCount > 0 && <>, {skippedCount} skipped</>}
                {warningCount > 0 && <>, {warningCount} warning{warningCount !== 1 ? 's' : ''}</>}
              </div>

              {warningCount > 0 && (
                <details className="import-warnings">
                  <summary>{warningCount} warning{warningCount !== 1 ? 's' : ''}</summary>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}><strong>{w.panelTitle}:</strong> {w.message}</li>
                    ))}
                  </ul>
                </details>
              )}

              {skippedCount > 0 && (
                <details className="import-skipped">
                  <summary>{skippedCount} skipped panel{skippedCount !== 1 ? 's' : ''}</summary>
                  <ul>
                    {result.skippedPanels.map((s, i) => (
                      <li key={i}><strong>{s.title}</strong> ({s.type}): {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              {panelCount > 0 && (
                <div className="import-preview-panels">
                  {result.dashboard.config.panels.map((p, i) => (
                    <div key={i} className="import-preview-panel">
                      <span>{p.title}</span>
                      <span className="panel-metric">{p.query.metric} ({p.query.type})</span>
                    </div>
                  ))}
                </div>
              )}

              {error && <div className="import-error">{error}</div>}
            </>
          )}
        </div>
        <div className="modal-footer">
          {result && (
            <button
              className="btn"
              onClick={() => { setResult(null); setError('') }}
            >
              Back
            </button>
          )}
          <button className="btn" onClick={onCancel}>Cancel</button>
          {result && (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || !name.trim()}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
