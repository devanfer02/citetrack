import { createServer, request as httpRequest, type Server } from 'node:http'
import { ProxyAgent } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PERF_ENABLED = process.env.PERF === '1'

const QUOTA_PER_CLIENT = 10
const ROTATING_PROXY_COUNT = 3
const STRESS_CONCURRENCY = Number(process.env.STRESS_CONCURRENCY ?? 10)

type ProxyHandle = {
  id: string
  server: Server
  url: string
  hits: { count: number }
}

type MockHandle = {
  server: Server
  url: string
  counts: Map<string, number>
  quotaTrips: { count: number }
}

const closeServer = (s: Server): Promise<void> =>
  new Promise((resolve) => s.close(() => resolve()))

const listenOn127 = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port =
        addr && typeof addr === 'object' && 'port' in addr ? addr.port : 0
      resolve(port)
    })
  })

const createMiniProxy = async (id: string): Promise<ProxyHandle> => {
  const hits = { count: 0 }
  const server = createServer((req, res) => {
    hits.count++
    if (!req.url) {
      res.writeHead(400)
      res.end()
      return
    }
    let target: URL
    try {
      target = new URL(req.url)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const upstream = httpRequest(
      {
        hostname: target.hostname,
        port: target.port ? Number(target.port) : 80,
        path: target.pathname + target.search,
        method: req.method,
        headers: {
          ...req.headers,
          'x-proxy-id': id,
          host: target.host,
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers)
        upRes.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  const port = await listenOn127(server)
  return { id, server, url: `http://127.0.0.1:${port}`, hits }
}

const createMockKbbi = async (): Promise<MockHandle> => {
  const counts = new Map<string, number>()
  const quotaTrips = { count: 0 }
  const server = createServer((req, res) => {
    if (req.url === '/Beranda/BatasSehari') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<title>Batas Sehari - KBBI</title>')
      return
    }
    const headerId = req.headers['x-proxy-id']
    const id =
      (Array.isArray(headerId) ? headerId[0] : headerId) ??
      req.socket.remoteAddress ??
      'direct'
    const c = (counts.get(id) ?? 0) + 1
    counts.set(id, c)
    if (c > QUOTA_PER_CLIENT) {
      quotaTrips.count++
      res.writeHead(302, { Location: '/Beranda/BatasSehari' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<html><body><div class="body-content"><h2>entri</h2><ol><li>def</li></ol></div></body></html>',
    )
  })
  const port = await listenOn127(server)
  return { server, url: `http://127.0.0.1:${port}`, counts, quotaTrips }
}

const dispatcherCache = new Map<string, ProxyAgent>()
const dispatcherFor = (url: string): ProxyAgent => {
  let d = dispatcherCache.get(url)
  if (!d) {
    d = new ProxyAgent({ uri: url, proxyTunnel: false })
    dispatcherCache.set(url, d)
  }
  return d
}

const fetchOnce = async (
  target: string,
  proxyUrl?: string,
): Promise<number> => {
  const init: RequestInit & { proxy?: string; dispatcher?: unknown } = {
    redirect: 'manual',
  }
  if (proxyUrl) {
    init.proxy = proxyUrl
    init.dispatcher = dispatcherFor(proxyUrl)
  }
  const res = await fetch(target, init)
  if (res.body) await res.body.cancel().catch(() => {})
  return res.status
}

describe.skipIf(!PERF_ENABLED)('kbbi proxy rotation stress', () => {
  let mock: MockHandle
  let proxies: ProxyHandle[]

  beforeAll(async () => {
    mock = await createMockKbbi()
    proxies = []
    for (let i = 0; i < ROTATING_PROXY_COUNT; i++) {
      proxies.push(await createMiniProxy(`proxy-${i}`))
    }
    console.log(
      `[stress] mock at ${mock.url}, ${proxies.length} proxies: ${proxies.map((p) => p.url).join(', ')}`,
    )
  })

  afterAll(async () => {
    for (const d of dispatcherCache.values()) await d.close().catch(() => {})
    dispatcherCache.clear()
    await Promise.all([
      closeServer(mock.server),
      ...proxies.map((p) => closeServer(p.server)),
    ])
  })

  it('Phase A — direct connections trip the per-client quota', async () => {
    mock.counts.clear()
    mock.quotaTrips.count = 0
    let firstQuotaAt = -1
    for (let i = 1; i <= 20; i++) {
      const status = await fetchOnce(`${mock.url}/entri/test${i}`)
      if (status === 302 && firstQuotaAt < 0) firstQuotaAt = i
    }
    console.log(
      `[stress:A] direct 20 reqs, first quota at req ${firstQuotaAt}, total 302s=${mock.quotaTrips.count}`,
    )
    expect(firstQuotaAt).toBe(QUOTA_PER_CLIENT + 1)
  }, 30_000)

  it(`Phase B — rotating across ${ROTATING_PROXY_COUNT} proxies clears ${ROTATING_PROXY_COUNT * QUOTA_PER_CLIENT} reqs without quota`, async () => {
    mock.counts.clear()
    mock.quotaTrips.count = 0
    for (const p of proxies) p.hits.count = 0
    const total = ROTATING_PROXY_COUNT * QUOTA_PER_CLIENT
    let ok = 0
    let quota = 0
    for (let i = 0; i < total; i++) {
      const proxy = proxies[i % proxies.length]
      const status = await fetchOnce(`${mock.url}/entri/test${i}`, proxy.url)
      if (status === 200) ok++
      else if (status === 302) quota++
    }
    console.log(
      `[stress:B] rotated ${total} reqs across ${ROTATING_PROXY_COUNT} proxies: ok=${ok} quota=${quota}`,
    )
    console.log(`[stress:B] mock per-client counts:`, Object.fromEntries(mock.counts))
    console.log(
      `[stress:B] proxy hit counts:`,
      Object.fromEntries(proxies.map((p) => [p.id, p.hits.count])),
    )
    expect(ok).toBe(total)
    expect(quota).toBe(0)
  }, 60_000)

  it(`Phase C — throughput comparison: direct vs rotated`, async () => {
    const measure = async (
      label: string,
      requests: number,
      proxyForIdx: (i: number) => string | undefined,
    ): Promise<{ rps: number; ok: number; quota: number; elapsedMs: number }> => {
      mock.counts.clear()
      mock.quotaTrips.count = 0
      let ok = 0
      let quota = 0
      let nextIdx = 0
      const start = performance.now()
      const worker = async (): Promise<void> => {
        while (true) {
          const i = nextIdx++
          if (i >= requests) return
          const proxyUrl = proxyForIdx(i)
          const status = await fetchOnce(
            `${mock.url}/entri/word${i}`,
            proxyUrl,
          )
          if (status === 200) ok++
          else if (status === 302) quota++
        }
      }
      await Promise.all(
        Array.from({ length: STRESS_CONCURRENCY }, () => worker()),
      )
      const elapsedMs = performance.now() - start
      const rps = (requests / elapsedMs) * 1000
      console.log(
        `[stress:C:${label}] reqs=${requests} concurrency=${STRESS_CONCURRENCY} ok=${ok} quota=${quota} elapsed=${elapsedMs.toFixed(0)}ms RPS=${rps.toFixed(0)}`,
      )
      return { rps, ok, quota, elapsedMs }
    }

    const withinQuota = QUOTA_PER_CLIENT
    const direct = await measure('direct', withinQuota, () => undefined)
    expect(direct.ok).toBe(withinQuota)

    const rotatedTotal = ROTATING_PROXY_COUNT * QUOTA_PER_CLIENT
    const rotated = await measure(
      'rotated',
      rotatedTotal,
      (i) => proxies[i % proxies.length].url,
    )
    expect(rotated.ok).toBe(rotatedTotal)

    console.log(
      `[stress:C:summary] direct RPS=${direct.rps.toFixed(0)} | rotated RPS=${rotated.rps.toFixed(0)} (across ${proxies.length} proxies, ${rotatedTotal} reqs)`,
    )
  }, 120_000)
})
