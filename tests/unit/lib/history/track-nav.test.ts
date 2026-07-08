import { describe, expect, it } from 'vitest'
import {
  isTrackComplete,
  trackHistoryDestination,
} from '#/lib/history/track-nav'

describe('isTrackComplete', () => {
  it('is complete only at the final passage-review phase', () => {
    expect(isTrackComplete({ phase: 'review-passages' })).toBe(true)
  })

  it.each([
    'upload',
    'review-citations',
    'review-references',
    'review-matches',
    'upload-sources',
  ] as const)('is incomplete at phase %s', (phase) => {
    expect(isTrackComplete({ phase })).toBe(false)
  })
})

describe('trackHistoryDestination', () => {
  it('routes a finished job to its results report', () => {
    expect(
      trackHistoryDestination({ id: 'job-1', phase: 'review-passages' }),
    ).toEqual({ to: '/results/$jobId', params: { jobId: 'job-1' } })
  })

  it('resumes an unfinished job at its persisted phase', () => {
    expect(
      trackHistoryDestination({ id: 'job-2', phase: 'upload-sources' }),
    ).toEqual({
      to: '/track',
      search: { jobId: 'job-2', phase: 'upload-sources' },
    })
  })

  it('sends an extraction-only job back to upload', () => {
    expect(trackHistoryDestination({ id: 'job-3', phase: 'upload' })).toEqual({
      to: '/track',
      search: { jobId: 'job-3', phase: 'upload' },
    })
  })
})
