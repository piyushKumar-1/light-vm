export function formatValue(v: number | null | undefined, unit: string): string {
  if (v == null || isNaN(v)) return '-'
  switch (unit) {
    case 'seconds':
      if (v < 0.001) return (v * 1e6).toFixed(0) + 'us'
      if (v < 1) return (v * 1000).toFixed(1) + 'ms'
      return v.toFixed(2) + 's'
    case 'bytes':
      if (v < 1024) return v.toFixed(0) + ' B'
      if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
      if (v < 1024 ** 3) return (v / 1024 / 1024).toFixed(1) + ' MB'
      return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    case 'percent':
      return (v * 100).toFixed(1) + '%'
    case 'ops/s':
    case 'req/s':
    case 'errors/s':
      if (v >= 1000) return (v / 1000).toFixed(1) + 'k/s'
      return v.toFixed(1) + '/s'
    case 'ms':
      if (v >= 1000) return (v / 1000).toFixed(2) + 's'
      return v.toFixed(1) + 'ms'
    case 'connections':
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
      return v.toFixed(0)
    default: {
      // Custom unit: format the number with SI suffixes and append the unit
      const suffix = unit ? ' ' + unit : ''
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M' + suffix
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k' + suffix
      if (Number.isInteger(v)) return v.toString() + suffix
      return v.toFixed(2) + suffix
    }
  }
}

export function parseDuration(s: string): number {
  if (!s) return 30000
  let ms = 0
  let remaining = s
  const dm = remaining.match(/(\d+)d/)
  if (dm) {
    ms += parseInt(dm[1], 10) * 86400000
    remaining = remaining.replace(dm[0], '')
  }
  const hm = remaining.match(/(\d+)h/)
  if (hm) {
    ms += parseInt(hm[1], 10) * 3600000
    remaining = remaining.replace(hm[0], '')
  }
  const mm = remaining.match(/(\d+)m/)
  if (mm) {
    ms += parseInt(mm[1], 10) * 60000
    remaining = remaining.replace(mm[0], '')
  }
  const sm = remaining.match(/(\d+(?:\.\d+)?)s/)
  if (sm) {
    ms += parseFloat(sm[1]) * 1000
  }
  return ms > 0 ? ms : 30000
}

export function parseDurationSeconds(s: string): number {
  return parseDuration(s) / 1000
}
