const DATE_FMT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
})

export function relativeTime(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const diff = Date.now() - date.getTime()
  if (diff < 0) return 'baru saja'
  const sec = Math.round(diff / 1000)
  if (sec < 30) return 'baru saja'
  if (sec < 60) return `${sec} detik yang lalu`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} menit yang lalu`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} jam yang lalu`
  const day = Math.round(hr / 24)
  if (day === 1) return 'kemarin'
  if (day < 7) return `${day} hari yang lalu`
  return DATE_FMT.format(date)
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return '<1 dtk'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec} dtk`
  const totalMin = Math.floor(totalSec / 60)
  const remSec = totalSec % 60
  if (totalMin < 60) {
    return remSec === 0 ? `${totalMin} mnt` : `${totalMin} mnt ${remSec} dtk`
  }
  const totalHr = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  return remMin === 0 ? `${totalHr} jam` : `${totalHr} jam ${remMin} mnt`
}
