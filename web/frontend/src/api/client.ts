import type {
  Dashboard,
  HealthResponse,
  MetricMeta,
  QueryRangeResponse,
  SessionInfo,
  TargetStatus,
} from './types'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init)
  if (resp.status === 401) {
    if (!window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login'
    }
    throw new Error('unauthorized')
  }
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  if (resp.status === 204) return undefined as T
  return resp.json()
}

// Auth
export async function checkSession(): Promise<SessionInfo> {
  return fetchJSON('/api/v1/auth/session')
}

export async function login(username: string, password: string): Promise<SessionInfo> {
  return fetchJSON('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  await fetchJSON('/api/v1/auth/logout', { method: 'POST' })
}

// Dashboards
export async function listDashboards(search?: string): Promise<Dashboard[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return fetchJSON(`/api/v1/dashboards${params}`)
}

export async function getDashboard(id: string): Promise<Dashboard> {
  return fetchJSON(`/api/v1/dashboards/${id}`)
}

export async function createDashboard(d: Partial<Dashboard>): Promise<Dashboard> {
  return fetchJSON('/api/v1/dashboards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  })
}

export async function updateDashboard(id: string, d: Partial<Dashboard>): Promise<Dashboard> {
  return fetchJSON(`/api/v1/dashboards/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  })
}

export async function deleteDashboard(id: string): Promise<void> {
  await fetchJSON(`/api/v1/dashboards/${id}`, { method: 'DELETE' })
}

export async function duplicateDashboard(id: string): Promise<Dashboard> {
  return fetchJSON(`/api/v1/dashboards/${id}/duplicate`, { method: 'POST' })
}

// Metrics
export async function getMetrics(target?: string): Promise<MetricMeta[]> {
  const params = target ? `?target=${encodeURIComponent(target)}` : ''
  return fetchJSON(`/api/v1/metrics${params}`)
}

// Query
export async function queryRange(
  metric: string,
  target: string,
  start: number,
  end: number,
  type: string,
  labels?: Record<string, string>,
  percentiles?: number[],
  since?: number,
  step?: number,
): Promise<QueryRangeResponse> {
  const params = new URLSearchParams({
    metric,
    target: target || '*',
    start: start.toString(),
    end: end.toString(),
    type: type || 'gauge',
  })
  if (labels && Object.keys(labels).length > 0) {
    params.set('labels', JSON.stringify(labels))
  }
  if (percentiles && percentiles.length > 0) {
    params.set('percentiles', percentiles.join(','))
  }
  if (since !== undefined) {
    params.set('since', since.toString())
  }
  if (step !== undefined && step > 0) {
    params.set('step', step.toString())
  }
  return fetchJSON(`/api/v1/query_range?${params}`)
}

export async function getTargets(): Promise<TargetStatus[]> {
  return fetchJSON('/api/v1/targets')
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchJSON('/api/v1/health')
}
