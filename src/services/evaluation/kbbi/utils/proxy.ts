import { type Dispatcher, ProxyAgent } from 'undici'
import { env } from '#/env'

type ProxyChoice = { url: string; dispatcher: Dispatcher }

let pool: string[] | null = null
let dispatcherCache: Map<string, Dispatcher> | null = null
let cursor = 0

const splitCsv = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const buildPool = (): string[] => splitCsv(env.KBBI_PROXY_URLS)

const getDispatcher = (url: string): Dispatcher => {
  dispatcherCache ??= new Map()
  let dispatcher = dispatcherCache.get(url)
  if (!dispatcher) {
    dispatcher = new ProxyAgent({ uri: url, proxyTunnel: false })
    dispatcherCache.set(url, dispatcher)
  }
  return dispatcher
}

export const nextProxy = (): ProxyChoice | undefined => {
  pool ??= buildPool()
  if (!pool.length) return undefined
  const url = pool[cursor % pool.length]
  cursor++
  return { url, dispatcher: getDispatcher(url) }
}

export const hasProxyPool = (): boolean => {
  pool ??= buildPool()
  return pool.length > 0
}

export const __resetProxyPoolForTests = (): void => {
  pool = null
  dispatcherCache = null
  cursor = 0
}
