import { type Dispatcher, ProxyAgent } from 'undici'
import { env } from '#/env'
import { getConfig } from '#/services/configurations-cache'
import {
  isSocks5Reachable,
  type SocksBridge,
  startSocksBridge,
} from '#/services/evaluation/kbbi/utils/socks-bridge'
import type { KbbiSourceName } from '#/services/evaluation/kbbi/sources'

type ProxyChoice = { url: string; dispatcher: Dispatcher }

const TOR_SCOPED_SOURCE: KbbiSourceName = 'kbbi.kemendikdasmen.go.id'

let pool: string[] | null = null
let dispatcherCache: Map<string, Dispatcher> | null = null
let cursor = 0
let torBridge: SocksBridge | null = null
let torInitPromise: Promise<void> | null = null
let torLogged = false
let torEnabled = false

const splitCsv = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const DEFAULT_TOR_HOST = '127.0.0.1'
const DEFAULT_TOR_PORT = 9050

const initTorIfReachable = async (): Promise<void> => {
  const host = env.TOR_SOCKS_HOST ?? DEFAULT_TOR_HOST
  const port = env.TOR_SOCKS_PORT ?? DEFAULT_TOR_PORT
  const reachable = await isSocks5Reachable(host, port)
  if (!reachable) {
    if (!torLogged) {
      torLogged = true
      console.warn(
        `[kbbi-proxy] kbbi.use_tor_proxy is ON but Tor SOCKS5 not reachable at ${host}:${port}; falling back to direct. If running bare-metal, install Tor locally; in Docker, ensure the 'tor' service is healthy.`,
      )
    }
    return
  }
  torBridge = await startSocksBridge(host, port)
  console.log(
    `[kbbi-proxy] Tor bridge listening at ${torBridge.url} → ${host}:${port}`,
  )
}

const ensureTorInitialized = async (): Promise<void> => {
  const useTor = (await getConfig('kbbi.use_tor_proxy')) === 1
  torEnabled = useTor
  if (!useTor) return
  torInitPromise ??= initTorIfReachable().catch((err) => {
    console.error('[kbbi-proxy] Tor bridge init failed:', err)
  })
  return torInitPromise
}

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

export const ensureProxyPoolReady = async (): Promise<void> => {
  await ensureTorInitialized()
  pool = buildPool()
}

export const nextProxy = (source?: KbbiSourceName): ProxyChoice | undefined => {
  if (source === TOR_SCOPED_SOURCE && torEnabled && torBridge) {
    return {
      url: torBridge.url,
      dispatcher: getDispatcher(torBridge.url),
    }
  }
  pool ??= buildPool()
  if (!pool.length) return undefined
  const url = pool[cursor % pool.length]
  cursor++
  return { url, dispatcher: getDispatcher(url) }
}

export const hasProxyPool = (): boolean => {
  pool ??= buildPool()
  return pool.length > 0 || torBridge !== null
}

export const __resetProxyPoolForTests = (): void => {
  pool = null
  dispatcherCache = null
  cursor = 0
  torBridge = null
  torInitPromise = null
  torLogged = false
  torEnabled = false
}
