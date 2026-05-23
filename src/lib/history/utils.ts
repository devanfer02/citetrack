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
  if (sec < 60) return `${sec} dtk lalu`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} mnt lalu`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  const day = Math.round(hr / 24)
  if (day === 1) return 'kemarin'
  if (day < 7) return `${day} hr lalu`
  return DATE_FMT.format(date)
}
