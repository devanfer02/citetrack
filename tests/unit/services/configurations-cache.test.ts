import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearConfigCache, getConfig } from '#/services/configurations-cache'

const mockSelect = vi.fn()

vi.mock('#/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelect(),
        }),
      }),
    }),
  },
}))

const publicModeState = { isPublicMode: false }

vi.mock('#/lib/public-mode', async () => {
  const actual = await vi.importActual<
    typeof import('#/lib/public-mode')
  >('#/lib/public-mode')
  return {
    ...actual,
    get isPublicMode() {
      return publicModeState.isPublicMode
    },
  }
})

beforeEach(() => {
  mockSelect.mockReset()
  publicModeState.isPublicMode = false
  clearConfigCache()
})

afterEach(() => {
  publicModeState.isPublicMode = false
  clearConfigCache()
})

describe('getConfig — PUBLIC_MODE override', () => {
  it('returns override value when PUBLIC_MODE=true and DB row is absent', async () => {
    publicModeState.isPublicMode = true
    mockSelect.mockResolvedValue([])
    await expect(getConfig('passage.embedding_model')).resolves.toBe('none')
    await expect(getConfig('upload.max_file_size_bytes')).resolves.toBe(
      10 * 1024 * 1024,
    )
    await expect(getConfig('autofetch.concurrency')).resolves.toBe(2)
    await expect(getConfig('purge.retention_days')).resolves.toBe(1)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns override value when PUBLIC_MODE=true even if DB row says otherwise', async () => {
    publicModeState.isPublicMode = true
    mockSelect.mockResolvedValue([{ value: 'multilingual-e5-base' }])
    await expect(getConfig('passage.embedding_model')).resolves.toBe('none')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns DB value when PUBLIC_MODE=false', async () => {
    publicModeState.isPublicMode = false
    mockSelect.mockResolvedValue([{ value: 'multilingual-e5-base' }])
    await expect(getConfig('passage.embedding_model')).resolves.toBe(
      'multilingual-e5-base',
    )
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('returns CONFIG_DEFAULTS value when PUBLIC_MODE=false and DB row is absent', async () => {
    publicModeState.isPublicMode = false
    mockSelect.mockResolvedValue([])
    await expect(getConfig('passage.embedding_model')).resolves.toBe(
      'multilingual-e5-small',
    )
  })

  it('does not override non-listed keys in PUBLIC_MODE=true', async () => {
    publicModeState.isPublicMode = true
    mockSelect.mockResolvedValue([{ value: 1 }])
    await expect(getConfig('kbbi.use_tor_proxy')).resolves.toBe(1)
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })
})
