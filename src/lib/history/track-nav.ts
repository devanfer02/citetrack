import type { TrackHistoryItem } from '#/services/history'

// A track job's pipeline runs upload → … → review-passages. `jobs.status`
// only tracks PDF extraction (done = text extracted), so completion is decided
// by the persisted pipeline phase: a job is finished only once it reaches the
// final passage-review phase. Anything earlier should resume in /track, not
// open the (still-empty) results report.
export function isTrackComplete(item: Pick<TrackHistoryItem, 'phase'>): boolean {
  return item.phase === 'review-passages'
}

export type TrackHistoryDestination =
  | { to: '/results/$jobId'; params: { jobId: string } }
  | { to: '/track'; search: { jobId: string; phase: PipelinePhase } }

export function trackHistoryDestination(
  item: Pick<TrackHistoryItem, 'id' | 'phase'>,
): TrackHistoryDestination {
  if (isTrackComplete(item)) {
    return { to: '/results/$jobId', params: { jobId: item.id } }
  }
  return { to: '/track', search: { jobId: item.id, phase: item.phase } }
}
