import { useRouter } from './lib/router'
import { useAuth } from './hooks/useAuth'
import { useHealth } from './hooks/useHealth'
import { AppHeader } from './components/AppHeader'
import { LoginPage } from './pages/LoginPage'
import { DashboardListPage } from './pages/DashboardListPage'
import { DashboardViewPage } from './pages/DashboardViewPage'
import { DashboardEditPage } from './pages/DashboardEditPage'

export function App() {
  const { route, navigate } = useRouter()
  const auth = useAuth()
  const { status, uptime } = useHealth()

  if (auth.loading) {
    return <div className="loading">Loading...</div>
  }

  // Auth gate
  if (auth.authRequired && !auth.authenticated) {
    return <LoginPage onLogin={auth.login} />
  }

  // Login page accessed when already authenticated
  if (route.page === 'login' && auth.authenticated) {
    navigate('#/')
    return null
  }

  const renderPage = () => {
    switch (route.page) {
      case 'login':
        return <LoginPage onLogin={auth.login} />
      case 'list':
        return <DashboardListPage navigate={navigate} />
      case 'view':
        return <DashboardViewPage id={route.id!} navigate={navigate} />
      case 'edit':
        return <DashboardEditPage id={route.id} navigate={navigate} />
      case 'new':
        return <DashboardEditPage navigate={navigate} />
      default:
        return <DashboardListPage navigate={navigate} />
    }
  }

  return (
    <>
      {route.page !== 'login' && (
        <AppHeader
          healthStatus={status}
          uptime={uptime}
          username={auth.username}
          authRequired={auth.authRequired}
          onLogout={auth.logout}
          navigate={navigate}
        />
      )}
      <main id="app">
        {renderPage()}
      </main>
    </>
  )
}
