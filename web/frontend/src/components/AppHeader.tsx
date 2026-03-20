import type { HealthStatus } from '../hooks/useHealth'

interface AppHeaderProps {
  healthStatus: HealthStatus
  uptime: number
  username: string
  authRequired: boolean
  onLogout: () => void
  navigate: (hash: string) => void
}

export function AppHeader({ healthStatus, uptime, username, authRequired, onLogout, navigate }: AppHeaderProps) {
  const dotClass =
    healthStatus === 'ok' ? 'dot dot-ok' :
    healthStatus === 'down' ? 'dot dot-down' :
    'dot dot-warn'

  const dotTitle =
    healthStatus === 'ok'
      ? `Healthy (uptime: ${Math.floor(uptime)}s)`
      : healthStatus === 'down'
      ? 'Unhealthy'
      : 'Checking...'

  return (
    <header id="header">
      <div className="header-left">
        <h1 className="header-logo" onClick={() => navigate('#/')}>light_vm</h1>
      </div>
      <div className="header-right">
        <span className={dotClass} title={dotTitle} />
        {authRequired && username && (
          <>
            <span className="header-user">{username}</span>
            <button className="btn btn-sm" onClick={onLogout}>Logout</button>
          </>
        )}
      </div>
    </header>
  )
}
