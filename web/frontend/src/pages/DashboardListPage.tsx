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
    <div className="list-page fade-in">
      <div className="list-header">
        <h2 className="list-title">Dashboards</h2>
        <span className="list-count">{!loading && `${dashboards.length} total`}</span>
      </div>
      <div className="list-toolbar">
        <div className="search-wrapper">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search dashboards..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="list-toolbar-actions">
          <button className="btn btn-sm" onClick={() => setShowImport(true)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}><path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Import
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('#/new')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            New Dashboard
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="dashboard-card skeleton-card">
              <div className="card-header">
                <div className="skeleton-bar" style={{width: '60%', height: 16}} />
                <div className="skeleton-bar" style={{width: '80%', height: 12, marginTop: 8}} />
              </div>
              <div className="card-meta">
                <div className="skeleton-bar" style={{width: 50, height: 12}} />
                <div className="skeleton-bar" style={{width: 40, height: 12}} />
              </div>
            </div>
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
              <path d="M16 28l6-8 6 4 8-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
            </svg>
          </div>
          <p className="empty-title">No dashboards yet</p>
          <p className="empty-desc">Create your first dashboard to start monitoring</p>
          <button className="btn btn-primary" onClick={() => navigate('#/new')}>
            Create Dashboard
          </button>
        </div>
      ) : (
        <div className="dashboard-grid">
          {dashboards.map(d => (
            <div key={d.id} className="dashboard-card" onClick={() => navigate(`#/view/${d.id}`)}>
              <div className="card-accent" />
              <div className="card-header">
                <h3>{d.name}</h3>
                {d.description && <p className="card-desc">{d.description}</p>}
              </div>
              <div className="card-meta">
                <span className="card-meta-item">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.2"/><path d="M4 8h2v3H4zM7 6h2v5H7zM10 4h2v7h-2z" fill="currentColor" opacity="0.6"/></svg>
                  {d.config.panels?.length || 0} panels
                </span>
                <span className="card-meta-item">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  {d.config.time_range || '1h'}
                </span>
              </div>
              <div className="card-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-ghost btn-xs" onClick={() => navigate(`#/edit/${d.id}`)}>Edit</button>
                <button className="btn btn-ghost btn-xs" onClick={() => handleDuplicate(d.id)}>Duplicate</button>
                <button className="btn btn-ghost btn-xs btn-danger" onClick={() => handleDelete(d.id, d.name)}>Delete</button>
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
