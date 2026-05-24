/**
 * Bun-runtime verification of the proxy rotation path.
 *
 * The vitest stress test runs under Node 22 (because vitest itself does),
 * so it proves the dispatcher branch works but says nothing about Bun.
 * Production runs `bun .output/server/index.mjs`, so we need an
 * independent confirmation that nextProxy()'s output is honored by
 * Bun's native fetch via the `proxy: '…'` option.
 *
 * Run: bun .claude/scripts/verify-proxy-bun.ts
 */

import { createServer, request as httpRequest, type Server } from 'node:http'

if (typeof Bun === 'undefined') {
  console.error('this script must be run under Bun (`bun .claude/scripts/verify-proxy-bun.ts`)')
  process.exit(1)
}

const QUOTA_PER_CLIENT = 10
const PROXY_COUNT = 10
const ROTATED_REQUESTS = 100

type MiniProxy = {
  id: string
  server: Server
  url: string
  hits: number
}

const listen = (s: Server): Promise<number> =>
  new Promise((resolve) =>
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port =
        addr && typeof addr === 'object' && 'port' in addr ? addr.port : 0
      resolve(port)
    }),
  )

const createMiniProxy = async (id: string): Promise<MiniProxy> => {
  const handle: MiniProxy = { id, server: null as unknown as Server, url: '', hits: 0 }
  handle.server = createServer((req, res) => {
    handle.hits++
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
  const port = await listen(handle.server)
  handle.url = `http://127.0.0.1:${port}`
  return handle
}

type Mock = {
  server: Server
  url: string
  counts: Map<string, number>
  quotaTrips: number
}

const createMock = async (): Promise<Mock> => {
  const counts = new Map<string, number>()
  const handle: Mock = { server: null as unknown as Server, url: '', counts, quotaTrips: 0 }
  handle.server = createServer((req, res) => {
    if (req.url === '/Beranda/BatasSehari') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<title>Batas Sehari</title>')
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
      handle.quotaTrips++
      res.writeHead(302, { Location: '/Beranda/BatasSehari' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<html><body><div class="body-content"><h2>entri</h2><ol><li>def</li></ol></div></body></html>',
    )
  })
  const port = await listen(handle.server)
  handle.url = `http://127.0.0.1:${port}`
  return handle
}

const closeServer = (s: Server): Promise<void> =>
  new Promise((resolve) => s.close(() => resolve()))

const main = async (): Promise<void> => {
  console.log(`runtime: Bun ${process.versions.bun} (node compat ${process.version})`)

  const mock = await createMock()
  const proxies: MiniProxy[] = []
  for (let i = 0; i < PROXY_COUNT; i++) {
    proxies.push(await createMiniProxy(`proxy-${i}`))
  }
  console.log(
    `mock=${mock.url}\nproxies=${proxies.map((p) => p.url).join(', ')}`,
  )

  process.env.NODE_ENV = 'test'
  process.env.KBBI_PROXY_URLS = proxies.map((p) => p.url).join(',')
  console.log(`KBBI_PROXY_URLS=${process.env.KBBI_PROXY_URLS}`)

  const { nextProxy, __resetProxyPoolForTests } = await import(
    '#/services/evaluation/kbbi/utils/proxy'
  )
  __resetProxyPoolForTests()

  console.log(`\n=== Phase A: direct fetch trips quota at K=${QUOTA_PER_CLIENT} ===`)
  let firstQuotaAt = -1
  for (let i = 1; i <= 20; i++) {
    const res = await fetch(`${mock.url}/entri/test${i}`, { redirect: 'manual' })
    if (res.body) await res.body.cancel().catch(() => {})
    if (res.status === 302 && firstQuotaAt < 0) firstQuotaAt = i
  }
  console.log(`direct first 302 at request ${firstQuotaAt} (expected ${QUOTA_PER_CLIENT + 1})`)
  const phaseAPass = firstQuotaAt === QUOTA_PER_CLIENT + 1

  console.log(`\n=== Phase B: rotation via nextProxy() defeats quota ===`)
  mock.counts.clear()
  mock.quotaTrips = 0
  for (const p of proxies) p.hits = 0
  let ok = 0
  let quota = 0
  for (let i = 0; i < ROTATED_REQUESTS; i++) {
    const next = nextProxy()
    if (!next) throw new Error('nextProxy() returned undefined - KBBI_PROXY_URLS not loaded?')
    const init: RequestInit & { proxy?: string; dispatcher?: unknown } = {
      redirect: 'manual',
    }
    init.proxy = next.url
    init.dispatcher = next.dispatcher
    const res = await fetch(`${mock.url}/entri/test${i}`, init)
    if (res.body) await res.body.cancel().catch(() => {})
    if (res.status === 200) ok++
    else if (res.status === 302) quota++
  }
  console.log(
    `rotated ${ROTATED_REQUESTS} reqs: ok=${ok} quota=${quota}`,
  )
  console.log(`mock per-client counts:`, Object.fromEntries(mock.counts))
  console.log(
    `proxy hits:`,
    Object.fromEntries(proxies.map((p) => [p.id, p.hits])),
  )
  const phaseBPass =
    ok === ROTATED_REQUESTS &&
    quota === 0 &&
    proxies.every((p) => p.hits === QUOTA_PER_CLIENT)

  console.log(`\n=== Phase C: throughput direct vs rotated ===`)
  const measure = async (
    label: string,
    requests: number,
    proxyForIdx: (i: number) => { url: string; dispatcher: unknown } | undefined,
  ): Promise<number> => {
    mock.counts.clear()
    mock.quotaTrips = 0
    let nextIdx = 0
    const start = performance.now()
    const concurrency = 10
    const worker = async () => {
      while (true) {
        const i = nextIdx++
        if (i >= requests) return
        const next = proxyForIdx(i)
        const init: RequestInit & {
          proxy?: string
          dispatcher?: unknown
        } = { redirect: 'manual' }
        if (next) {
          init.proxy = next.url
          init.dispatcher = next.dispatcher
        }
        const res = await fetch(`${mock.url}/entri/word${i}`, init)
        if (res.body) await res.body.cancel().catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    const elapsed = performance.now() - start
    const rps = (requests / elapsed) * 1000
    console.log(
      `[${label}] reqs=${requests} concurrency=${concurrency} elapsed=${elapsed.toFixed(0)}ms RPS=${rps.toFixed(0)}`,
    )
    return rps
  }
  const directRps = await measure('direct', QUOTA_PER_CLIENT, () => undefined)
  const rotatedRps = await measure(
    'rotated',
    ROTATED_REQUESTS,
    (i) => proxies[i % proxies.length],
  )
  console.log(
    `summary: direct=${directRps.toFixed(0)} RPS | rotated=${rotatedRps.toFixed(0)} RPS`,
  )

  console.log(
    `\nVERDICT: PhaseA=${phaseAPass ? 'PASS' : 'FAIL'} PhaseB=${phaseBPass ? 'PASS' : 'FAIL'}`,
  )

  await Promise.all([
    closeServer(mock.server),
    ...proxies.map((p) => closeServer(p.server)),
  ])

  if (!phaseAPass || !phaseBPass) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
