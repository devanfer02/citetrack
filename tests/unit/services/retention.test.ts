// Scope: covers the "seed only when absent" conditional branch in
// ensureRetentionConfigSeeded. The Drizzle insert/select chain is mocked,
// so this file does NOT verify the actual SQL or the ON CONFLICT DO NOTHING
// behaviour against real Postgres. Add an integration test (testcontainer)
// if the value warrants it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelect = vi.fn()
const mockInsertValues = vi.fn()
const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined)

vi.mock('#/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelect(),
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        mockInsertValues(v)
        return { onConflictDoNothing: mockOnConflictDoNothing }
      },
    }),
  },
}))

vi.mock('#/services/configurations-cache', () => ({
  clearConfigCache: vi.fn(),
  getConfig: vi.fn(),
}))

vi.mock('#/env', () => ({
  env: { JOB_RETENTION_DAYS: 3 },
}))

import { ensureRetentionConfigSeeded } from '#/services/retention'

beforeEach(() => {
  mockSelect.mockReset()
  mockInsertValues.mockReset()
  mockOnConflictDoNothing.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ensureRetentionConfigSeeded', () => {
  it('inserts purge.retention_days from env when no row exists', async () => {
    mockSelect.mockResolvedValue([])
    await ensureRetentionConfigSeeded()
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'purge.retention_days',
        value: 3,
      }),
    )
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  it('does not insert when a row already exists', async () => {
    mockSelect.mockResolvedValue([{ code: 'purge.retention_days' }])
    await ensureRetentionConfigSeeded()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockOnConflictDoNothing).not.toHaveBeenCalled()
  })
})
