import { useState, useEffect, useCallback } from 'react'
import { listDashboards, deleteDashboard, duplicateDashboard } from '../api/client'
import type { Dashboard } from '../api/types'
import { ImportDashboardModal } from '../components/ImportDashboardModal'

interface DashboardListPageProps {
  navigate: (hash: string) => void
}

export function DashboardListPage({ navigate }: DashboardListPageProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const load = useCallback(async () => {
    try {
      const list = await listDashboards(search || undefined)
      setDashboards(list)
    } catch { /* ignore */ }
    setLoading(false)
  }, [search])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete dashboard "${name}"?`)) return
    await deleteDashboard(id)
    load()
  }

  const handleDuplicate = async (id: string) => {
    await duplicateDashboard(id)
    load()
  }

  return (
    <div className="list-page">
      <div className="list-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search dashboards..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn" onClick={() => setShowImport(true)}>
          Import JSON
        </button>
        <button className="btn btn-primary" onClick={() => navigate('#/new')}>
          + New Dashboard
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : dashboards.length === 0 ? (
        <div className="empty-state">
          <p>No dashboards found</p>
          <button className="btn btn-primary" onClick={() => navigate('#/new')}>
            Create your first dashboard
          </button>
        </div>
      ) : (
        <div className="dashboard-grid">
          {dashboards.map(d => (
            <div key={d.id} className="dashboard-card">
              <div className="card-header" onClick={() => navigate(`#/view/${d.id}`)}>
                <h3>{d.name}</h3>
                {d.description && <p className="card-desc">{d.description}</p>}
              </div>
              <div className="card-meta">
                <span>{d.config.panels?.length || 0} panels</span>
                <span>{d.config.time_range || '1h'} range</span>
              </div>
              <div className="card-actions">
                <button className="btn btn-sm" onClick={() => navigate(`#/view/${d.id}`)}>View</button>
                <button className="btn btn-sm" onClick={() => navigate(`#/edit/${d.id}`)}>Edit</button>
                <button className="btn btn-sm" onClick={() => handleDuplicate(d.id)}>Duplicate</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id, d.name)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showImport && (
        <ImportDashboardModal
          onComplete={(id) => {
            setShowImport(false)
            navigate(`#/view/${id}`)
          }}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
