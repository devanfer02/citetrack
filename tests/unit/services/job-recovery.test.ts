import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS } from '#/lib/jobs/heartbeat'
import { partitionStaleJobs } from '#/services/job-recovery'

describe('partitionStaleJobs — attempt-cap boundary', () => {
  it('requeues a job below the cap', () => {
    const { requeue, fail } = partitionStaleJobs([
      { id: 'a', attempts: MAX_ATTEMPTS - 1 },
    ])
    expect(requeue).toEqual(['a'])
    expect(fail).toEqual([])
  })

  it('fails a job exactly at the cap (no infinite retry loop)', () => {
    const { requeue, fail } = partitionStaleJobs([
      { id: 'a', attempts: MAX_ATTEMPTS },
    ])
    expect(requeue).toEqual([])
    expect(fail).toEqual(['a'])
  })

  it('fails a job past the cap', () => {
    const { fail } = partitionStaleJobs([
      { id: 'a', attempts: MAX_ATTEMPTS + 5 },
    ])
    expect(fail).toEqual(['a'])
  })

  it('requeues a brand-new stranded job (0 attempts)', () => {
    const { requeue } = partitionStaleJobs([{ id: 'a', attempts: 0 }])
    expect(requeue).toEqual(['a'])
  })

  it('partitions a mixed batch, preserving ids on each side', () => {
    const { requeue, fail } = partitionStaleJobs([
      { id: 'keep1', attempts: 0 },
      { id: 'drop1', attempts: MAX_ATTEMPTS },
      { id: 'keep2', attempts: MAX_ATTEMPTS - 1 },
      { id: 'drop2', attempts: MAX_ATTEMPTS + 1 },
    ])
    expect(requeue).toEqual(['keep1', 'keep2'])
    expect(fail).toEqual(['drop1', 'drop2'])
  })

  it('returns empty partitions for an empty batch', () => {
    expect(partitionStaleJobs([])).toEqual({ requeue: [], fail: [] })
  })
})
