import { env } from '#/env'

let pool: string[] | null = null
let cursor = 0

const splitCsv = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const buildPool = (): string[] => splitCsv(env.KBBI_PROXY_URLS)

export const nextProxyUrl = (): string | undefined => {
  pool ??= buildPool()
  if (!pool.length) return undefined
  const url = pool[cursor % pool.length]
  cursor++
  return url
}

export const hasProxyPool = (): boolean => {
  pool ??= buildPool()
  return pool.length > 0
}

export const __resetProxyPoolForTests = (): void => {
  pool = null
  cursor = 0
}
