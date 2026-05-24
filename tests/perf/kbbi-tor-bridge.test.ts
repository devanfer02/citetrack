import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'
import { ProxyAgent } from 'undici'
import {
  isSocks5Reachable,
  startSocksBridge,
  stopSocksBridge,
  type SocksBridge,
} from '#/services/evaluation/kbbi/utils/socks-bridge'

const TOR_ENABLED =
  process.env.PERF === '1' && process.env.PERF_TOR === '1'

const TOR_IMAGE =
  'peterdavehello/tor-socks-proxy@sha256:0cc12d36d31265ce828c8422a7e163a0bf46755e90531f4c7d38a6149f071729'
const TOR_INTERNAL_PORT = 9150

const TOR_BOOTSTRAP_TIMEOUT_MS = 90_000
const REQUEST_COUNT = Number(process.env.PERF_TOR_REQS ?? 100)
const CONCURRENCY = Number(process.env.PERF_TOR_CONCURRENCY ?? 10)

type FetchResult = { ok: boolean; ip: string | null; ms: number }

const dispatcherCache = new Map<string, ProxyAgent>()
const dispatcherFor = (url: string): ProxyAgent => {
  let d = dispatcherCache.get(url)
  if (!d) {
    d = new ProxyAgent({ uri: url, proxyTunnel: true })
    dispatcherCache.set(url, d)
  }
  return d
}

const fetchThroughProxy = async (
  url: string,
  proxyUrl: string,
  signal: AbortSignal,
): Promise<FetchResult> => {
  const start = performance.now()
  try {
    const init: RequestInit & { proxy?: string; dispatcher?: unknown } = {
      proxy: proxyUrl,
      dispatcher: dispatcherFor(proxyUrl),
      signal,
    }
    const res = await fetch(url, init)
    const ms = performance.now() - start
    if (!res.ok) {
      if (res.body) await res.body.cancel().catch(() => {})
      return { ok: false, ip: null, ms }
    }
    const body = (await res.json()) as { ip?: string }
    return { ok: true, ip: body.ip ?? null, ms }
  } catch {
    return { ok: false, ip: null, ms: performance.now() - start }
  }
}

describe.skipIf(!TOR_ENABLED)('kbbi tor bridge — testcontainers', () => {
  let container: StartedTestContainer
  let bridge: SocksBridge

  beforeAll(async () => {
    console.log(`[tor-bridge] pulling and starting ${TOR_IMAGE}`)
    container = await new GenericContainer(TOR_IMAGE)
      .withExposedPorts(TOR_INTERNAL_PORT)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(30_000)
      .start()
    const host = container.getHost()
    const port = container.getMappedPort(TOR_INTERNAL_PORT)
    console.log(`[tor-bridge] Tor SOCKS5 at ${host}:${port}, waiting for bootstrap…`)

    const bootStart = performance.now()
    let bootstrapped = false
    while (performance.now() - bootStart < TOR_BOOTSTRAP_TIMEOUT_MS) {
      const reachable = await isSocks5Reachable(host, port)
      if (reachable) {
        bridge = await startSocksBridge(host, port)
        try {
          const probeCtrl = new AbortController()
          const probeTimer = setTimeout(() => probeCtrl.abort(), 8_000)
          const probe = await fetch('https://api.ipify.org/?format=json', {
            proxy: bridge.url,
            dispatcher: dispatcherFor(bridge.url),
            signal: probeCtrl.signal,
          } as RequestInit & { proxy: string; dispatcher: unknown })
          clearTimeout(probeTimer)
          if (probe.ok) {
            bootstrapped = true
            const json = (await probe.json()) as { ip?: string }
            console.log(
              `[tor-bridge] bootstrapped in ${(performance.now() - bootStart).toFixed(0)}ms, exit IP=${json.ip ?? 'unknown'}`,
            )
            break
          }
          if (probe.body) await probe.body.cancel().catch(() => {})
        } catch {
          await stopSocksBridge(bridge)
        }
      }
      await sleep(2_000)
    }
    if (!bootstrapped) {
      throw new Error(
        `Tor bridge did not become usable within ${TOR_BOOTSTRAP_TIMEOUT_MS}ms`,
      )
    }
    console.log(`[tor-bridge] HTTP→SOCKS bridge at ${bridge.url}`)
  }, TOR_BOOTSTRAP_TIMEOUT_MS + 30_000)

  afterAll(async () => {
    for (const d of dispatcherCache.values()) await d.close().catch(() => {})
    dispatcherCache.clear()
    if (bridge) await stopSocksBridge(bridge)
    if (container) await container.stop()
  }, 60_000)

  it(
    'exit IP via Tor differs from direct IP',
    async () => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      const directRes = await fetch('https://api.ipify.org/?format=json', {
        signal: ctrl.signal,
      })
      const direct = (await directRes.json()) as { ip: string }
      const torRes = await fetchThroughProxy(
        'https://api.ipify.org/?format=json',
        bridge.url,
        ctrl.signal,
      )
      clearTimeout(timer)
      console.log(
        `[tor-bridge] direct IP=${direct.ip} | tor IP=${torRes.ip} (${torRes.ms.toFixed(0)} ms)`,
      )
      expect.soft(torRes.ok, 'Tor route succeeded').toBe(true)
      expect.soft(torRes.ip, 'Tor returned an exit IP').toBeTruthy()
      expect
        .soft(torRes.ip, 'Tor exit IP differs from real IP')
        .not.toBe(direct.ip)
    },
    60_000,
  )

  it(
    `${REQUEST_COUNT} requests through Tor with concurrency ${CONCURRENCY}`,
    async () => {
      const ctrl = new AbortController()
      const timer = setTimeout(
        () => ctrl.abort(),
        Math.max(REQUEST_COUNT * 3_000, 120_000),
      )
      let nextIdx = 0
      let ok = 0
      const exitIps = new Set<string>()
      const latencies: number[] = []
      const start = performance.now()

      const worker = async (): Promise<void> => {
        while (true) {
          const i = nextIdx++
          if (i >= REQUEST_COUNT) return
          const r = await fetchThroughProxy(
            'https://api.ipify.org/?format=json',
            bridge.url,
            ctrl.signal,
          )
          if (r.ok) {
            ok++
            latencies.push(r.ms)
            if (r.ip) exitIps.add(r.ip)
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
      clearTimeout(timer)

      const elapsedMs = performance.now() - start
      const rps = (REQUEST_COUNT / elapsedMs) * 1000
      const sorted = [...latencies].toSorted((a, b) => a - b)
      const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      const max = sorted[sorted.length - 1] ?? 0

      console.log(
        `[tor-bridge] ${REQUEST_COUNT} reqs ok=${ok} rps=${rps.toFixed(2)} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${max.toFixed(0)}ms distinct-exit-ips=${exitIps.size}`,
      )
      expect.soft(ok, 'all requests succeeded').toBe(REQUEST_COUNT)
      expect.soft(exitIps.size, 'observed at least 1 Tor exit IP').toBeGreaterThan(0)
    },
    10 * 60_000,
  )
})
