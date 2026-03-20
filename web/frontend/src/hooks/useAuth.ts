import { useState, useEffect, useCallback } from 'react'
import { checkSession, login as apiLogin, logout as apiLogout } from '../api/client'

export interface AuthState {
  loading: boolean
  authenticated: boolean
  authRequired: boolean
  username: string
  login: (username: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    checkSession()
      .then(info => {
        setAuthenticated(info.authenticated)
        setAuthRequired(info.auth_required)
        setUsername(info.username || '')
      })
      .catch(() => {
        setAuthenticated(false)
        setAuthRequired(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (user: string, pass: string): Promise<string | null> => {
    try {
      const info = await apiLogin(user, pass)
      setAuthenticated(info.authenticated)
      setUsername(info.username || user)
      return null
    } catch {
      return 'Invalid credentials'
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch { /* ignore */ }
    setAuthenticated(false)
    setUsername('')
    window.location.hash = '#/login'
  }, [])

  return { loading, authenticated, authRequired, username, login, logout }
}
