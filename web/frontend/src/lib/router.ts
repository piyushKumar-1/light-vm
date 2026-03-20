import { useState, useEffect, useCallback } from 'react'

export interface Route {
  page: 'login' | 'list' | 'view' | 'edit' | 'new'
  id?: string
}

function parseHash(): Route {
  const hash = window.location.hash || '#/'
  if (hash === '#/login') return { page: 'login' }
  if (hash === '#/new') return { page: 'new' }
  const viewMatch = hash.match(/^#\/view\/(.+)$/)
  if (viewMatch) return { page: 'view', id: viewMatch[1] }
  const editMatch = hash.match(/^#\/edit\/(.+)$/)
  if (editMatch) return { page: 'edit', id: editMatch[1] }
  return { page: 'list' }
}

export function useRouter(): { route: Route; navigate: (hash: string) => void } {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash
  }, [])

  return { route, navigate }
}
