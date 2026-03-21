import { useState, FormEvent } from 'react'

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<string | null>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const err = await onLogin(username, password)
    setSubmitting(false)
    if (err) {
      setError(err)
    } else {
      window.location.hash = '#/'
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <form className="login-form fade-in" onSubmit={handleSubmit}>
        <div className="login-logo">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 14l3-4 3 2 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2>light_vm</h2>
        <p className="login-subtitle">Sign in to your monitoring dashboard</p>
        {error && <div className="login-error">{error}</div>}
        <div className="login-field">
          <label htmlFor="login-user">Username</label>
          <input
            id="login-user"
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="login-field">
          <label htmlFor="login-pass">Password</label>
          <input
            id="login-pass"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={submitting}>
          {submitting ? (
            <span className="login-spinner" />
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </div>
  )
}
