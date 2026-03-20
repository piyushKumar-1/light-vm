import { useEffect, useState } from 'react'
import { getHealth } from '../api/client'

export type HealthStatus = 'ok' | 'down' | 'unknown'

export function useHealth(intervalMs = 30000) {
  const [status, setStatus] = useState<HealthStatus>('unknown')
  const [uptime, setUptime] = useState(0)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const h = await getHealth()
        if (mounted) {
          setStatus(h.status === 'ok' ? 'ok' : 'down')
          setUptime(h.uptime_seconds)
        }
      } catch {
        if (mounted) setStatus('down')
      }
    }

    check()
    const id = setInterval(check, intervalMs)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [intervalMs])

  return { status, uptime }
}
