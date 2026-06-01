import { describe, expect, it } from 'vitest'
import {
  emptyChangeLog,
  formatChangeLogText,
  summarizeChangeLog,
} from '#/services/evaluation/apply/change-log'
import type { ChangeLog } from '#/services/evaluation/apply/types'

function sampleLog(): ChangeLog {
  return {
    applied: [
      {
        findingId: 1,
        pageNumber: 3,
        category: 'eyd',
        ruleId: 'eyd.double-space',
        kind: 'replace',
        before: 'dua  spasi',
        after: 'dua spasi',
      },
      {
        findingId: 3,
        pageNumber: 4,
        category: 'eyd',
        ruleId: 'eyd.foreign-not-italic',
        kind: 'italic',
        before: 'framework',
        after: 'framework',
      },
    ],
    unlocated: [
      {
        findingId: 2,
        pageNumber: 5,
        ruleId: 'kbbi.typo',
        token: 'kucing',
        suggestion: 'anjing',
        reason: 'tidak ditemukan di dokumen',
      },
    ],
  }
}

describe('summarizeChangeLog', () => {
  it('counts applied and unlocated', () => {
    expect(summarizeChangeLog(sampleLog())).toEqual({
      appliedCount: 2,
      unlocatedCount: 1,
    })
  })
})

describe('formatChangeLogText', () => {
  it('lists every applied and unlocated edit in full', () => {
    const text = formatChangeLogText(sampleLog())
    expect(text).toContain('Perubahan diterapkan: 2')
    expect(text).toContain('Tidak dapat diterapkan: 1')
    expect(text).toContain('"dua  spasi" → "dua spasi"')
    expect(text).toContain('"framework" dijadikan miring')
    expect(text).toContain('"kucing" → "anjing"')
    expect(text).toContain('tidak ditemukan di dokumen')
  })

  it('does not truncate large change lists', () => {
    const log = emptyChangeLog()
    for (let i = 1; i <= 200; i++) {
      log.applied.push({
        findingId: i,
        pageNumber: i,
        category: 'eyd',
        ruleId: 'eyd.test',
        before: `kata${i}`,
        after: `Kata${i}`,
      })
    }
    const text = formatChangeLogText(log)
    expect(text).toContain('kata1"')
    expect(text).toContain('kata200"')
    expect(text).not.toMatch(/lainnya|dan \d+ lagi|\.\.\./)
  })
})
