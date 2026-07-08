import { beforeEach, describe, expect, it, vi } from 'vitest'

type JarLike = {
  setCookie: (cookie: string, url: string) => void
  getCookieString: (url: string) => string
}

const { impitFetch, state } = vi.hoisted(() => ({
  impitFetch: vi.fn(),
  state: { ctorCount: 0, jar: null as JarLike | null },
}))

vi.mock('impit', () => ({
  Impit: class {
    constructor(opts: { cookieJar?: JarLike }) {
      state.ctorCount++
      state.jar = opts.cookieJar ?? null
    }
    fetch(url: string, init?: RequestInit) {
      return impitFetch(url, init)
    }
  },
}))

vi.mock('#/services/logs/logged-fetch', () => ({
  logExternalCall: vi.fn(),
}))

const { fetchTypoOnlineEntry, resetTypoOnlineSession } = await import(
  '#/services/evaluation/kbbi/sources/typoonline-fetch'
)

const fragment = '<div id="textres"><b class="key">rumah</b> tempat tinggal</div>'

// Homepage carries the inline JS: { ..., a3g4d21h4k: readCookie('k55b1n5f8') }
const primeHtml =
  "<script>function search(){$.ajax({data:{checktext:1,ntxt:$('#txtbox').val(),a3g4d21h4k:readCookie('k55b1n5f8')}})}</script>"

// Simulate impit routing the server's Set-Cookie into the shared jar on prime.
const primeWithCookie = (token: string) => (url: string) => {
  state.jar?.setCookie(`k55b1n5f8=${token}; path=/`, url)
  return Promise.resolve(new Response(primeHtml, { status: 200 }))
}

beforeEach(() => {
  impitFetch.mockReset()
  resetTypoOnlineSession()
})

describe('fetchTypoOnlineEntry', () => {
  it('primes the homepage for the CSRF cookie then POSTs the form to api-kbbi', async () => {
    impitFetch
      .mockImplementationOnce(primeWithCookie('tok123'))
      .mockResolvedValueOnce(new Response(fragment, { status: 200 }))

    const result = await fetchTypoOnlineEntry('rumah')

    expect(result).toEqual({ raw: fragment, attempted: true, rateLimited: false })
    expect(impitFetch).toHaveBeenCalledTimes(2)

    const [primeUrl] = impitFetch.mock.calls[0]
    const [postUrl, postInit] = impitFetch.mock.calls[1]
    expect(primeUrl).toBe('https://typoonline.com/')
    expect(postUrl).toBe('https://typoonline.com/api-kbbi/rumah')
    expect(postInit.method).toBe('POST')
    expect(postInit.body).toContain('ntxt=rumah')
    expect(postInit.body).toContain('checktext=1')
    expect(postInit.body).toContain('a3g4d21h4k=tok123')
  })

  it('treats a 200 "tidak ditemukan" body as a conclusive attempt', async () => {
    impitFetch
      .mockImplementationOnce(primeWithCookie('tok123'))
      .mockResolvedValueOnce(
        new Response('Kata zxqwerty tidak ditemukan', { status: 200 }),
      )

    const result = await fetchTypoOnlineEntry('zxqwerty')

    expect(result).toEqual({
      raw: 'Kata zxqwerty tidak ditemukan',
      attempted: true,
      rateLimited: false,
    })
  })

  it('reports rateLimited when Cloudflare gates the prime (403)', async () => {
    impitFetch.mockResolvedValueOnce(new Response(null, { status: 403 }))

    const result = await fetchTypoOnlineEntry('rumah')

    expect(result).toEqual({ raw: null, attempted: false, rateLimited: true })
    expect(impitFetch).toHaveBeenCalledTimes(1)
  })

  it('re-primes once on a 403 from the POST (stale CSRF), then succeeds', async () => {
    impitFetch
      .mockImplementationOnce(primeWithCookie('stale'))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockImplementationOnce(primeWithCookie('fresh'))
      .mockResolvedValueOnce(new Response(fragment, { status: 200 }))

    const result = await fetchTypoOnlineEntry('rumah')

    expect(result).toEqual({ raw: fragment, attempted: true, rateLimited: false })
    expect(impitFetch).toHaveBeenCalledTimes(4)
    const [, secondPost] = impitFetch.mock.calls[3]
    expect(secondPost.body).toContain('a3g4d21h4k=fresh')
  })

  it('reuses the cached token on the next word (no second prime)', async () => {
    impitFetch
      .mockImplementationOnce(primeWithCookie('tok123'))
      .mockResolvedValueOnce(new Response(fragment, { status: 200 }))
    await fetchTypoOnlineEntry('rumah')

    impitFetch.mockResolvedValueOnce(new Response(fragment, { status: 200 }))
    const result = await fetchTypoOnlineEntry('sepeda')

    expect(result.attempted).toBe(true)
    expect(impitFetch).toHaveBeenCalledTimes(3)
    const [postUrl] = impitFetch.mock.calls[2]
    expect(postUrl).toBe('https://typoonline.com/api-kbbi/sepeda')
  })

  it('reuses a single impit instance across calls', async () => {
    impitFetch.mockResolvedValue(new Response(fragment, { status: 200 }))
    await fetchTypoOnlineEntry('a')
    await fetchTypoOnlineEntry('b')
    expect(state.ctorCount).toBe(1)
  })
})
