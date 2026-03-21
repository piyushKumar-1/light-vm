import type { HealthStatus } from '../hooks/useHealth'

interface AppHeaderProps {
  healthStatus: HealthStatus
  uptime: number
  username: string
  authRequired: boolean
  onLogout: () => void
  navigate: (hash: string) => void
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export function AppHeader({ healthStatus, uptime, username, authRequired, onLogout, navigate }: AppHeaderProps) {
  const dotClass =
    healthStatus === 'ok' ? 'dot dot-ok' :
    healthStatus === 'down' ? 'dot dot-down' :
    'dot dot-warn'

  const statusLabel =
    healthStatus === 'ok'
      ? `Healthy \u00b7 ${formatUptime(uptime)}`
      : healthStatus === 'down'
      ? 'Unhealthy'
      : 'Checking...'

  const initial = username ? username[0].toUpperCase() : '?'

  return (
    <header id="header">
      <div className="header-left">
        <h1 className="header-logo" onClick={() => navigate('#/')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{marginRight: 6, verticalAlign: -3}}>
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 14l3-4 3 2 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          light_vm
        </h1>
      </div>
      <div className="header-right">
        <div className="header-status" title={statusLabel}>
          <span className={dotClass} />
          <span className="header-status-text">{statusLabel}</span>
        </div>
        {authRequired && username && (
          <div className="header-user-section">
            <div className="header-avatar" title={username}>{initial}</div>
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  )
}
