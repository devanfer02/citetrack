import { setTimeout as sleep } from 'node:timers/promises'

const MIN_GAP_MS = 400
const JITTER_MS = 200
const MAX_PAUSE_MS = 24 * 60 * 60_000
const DEFAULT_PAUSE_MS = 60_000

const lastCallAt = new Map<string, number>()
const pausedUntil = new Map<string, number>()
const hostQueues = new Map<string, Promise<void>>()

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const computeWait = (host: string): number => {
  const now = Date.now()
  const paused = pausedUntil.get(host) ?? 0
  if (paused > now) return paused - now
  const last = lastCallAt.get(host) ?? 0
  const elapsed = now - last
  const target = MIN_GAP_MS + Math.random() * JITTER_MS
  return Math.max(0, target - elapsed)
}

export async function throttleHost(
  host: string,
  signal?: AbortSignal,
): Promise<void> {
  const prev = hostQueues.get(host) ?? Promise.resolve()
  const next = prev.then(async () => {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted')
    const wait = computeWait(host)
    if (wait > 0) await sleep(wait, undefined, { signal })
    lastCallAt.set(host, Date.now())
  })
  hostQueues.set(
    host,
    next.catch(() => {}),
  )
  await next
}

export const parseRetryAfter = (header: string | null): number => {
  if (!header) return DEFAULT_PAUSE_MS
  const secs = Number(header)
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(secs * 1000, MAX_PAUSE_MS)
  }
  const at = Date.parse(header)
  if (!Number.isNaN(at)) {
    return Math.max(0, Math.min(at - Date.now(), MAX_PAUSE_MS))
  }
  return DEFAULT_PAUSE_MS
}

export const pauseHost = (host: string, ms: number): void => {
  const until = Date.now() + Math.min(ms, MAX_PAUSE_MS)
  const prev = pausedUntil.get(host) ?? 0
  if (until > prev) pausedUntil.set(host, until)
}

export const isHostPaused = (host: string): boolean =>
  (pausedUntil.get(host) ?? 0) > Date.now()

export const __resetThrottleForTests = (): void => {
  lastCallAt.clear()
  pausedUntil.clear()
  hostQueues.clear()
}
