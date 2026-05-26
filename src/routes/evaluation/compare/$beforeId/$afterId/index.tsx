import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { isLocalEnv } from '#/env'
import { getEvaluationComparison } from '#/services/evaluation/compare'
import { CompareHeader } from './-sections/compare-header'
import { CompareScoreboard } from './-sections/compare-scoreboard'
import { FindingDeltaList } from './-sections/finding-delta-list'
import { RuleDeltas } from './-sections/rule-deltas'

const comparisonQuery = (beforeId: string, afterId: string) =>
  queryOptions({
    queryKey: ['evaluation-comparison', beforeId, afterId] as const,
    queryFn: () => getEvaluationComparison({ data: { beforeId, afterId } }),
    staleTime: 5 * 60_000,
  })

export const Route = createFileRoute(
  '/evaluation/compare/$beforeId/$afterId/',
)({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: ComparePage,
  head: () => ({
    meta: [
      { title: 'Perbandingan evaluation · CiteTrack' },
      {
        name: 'description',
        content:
          'Bandingkan dua hasil evaluation untuk melihat temuan yang sudah dibereskan dan yang masih perlu disentuh.',
      },
    ],
  }),
  loader: async ({
    context: { queryClient },
    params: { beforeId, afterId },
  }) => {
    const report = await queryClient.ensureQueryData(
      comparisonQuery(beforeId, afterId),
    )
    // Canonicalize URL order so refresh + share land on older->newer.
    if (report.before.job.id !== beforeId || report.after.job.id !== afterId) {
      throw redirect({
        to: '/evaluation/compare/$beforeId/$afterId',
        params: {
          beforeId: report.before.job.id,
          afterId: report.after.job.id,
        },
        replace: true,
      })
    }
  },
})

function ComparePage() {
  const { beforeId, afterId } = Route.useParams()
  const { data } = useQuery(comparisonQuery(beforeId, afterId))
  if (!data) return null

  return (
    <main className="flex-1">
      <CompareHeader report={data} />
      <CompareScoreboard scoreboard={data.scoreboard} />
      <FindingDeltaList
        tone="mint"
        kind="resolved"
        buckets={data.resolved}
        afterId={afterId}
      />
      <FindingDeltaList
        tone="butter"
        kind="stillPresent"
        buckets={data.stillPresent}
        afterId={afterId}
      />
      <FindingDeltaList
        tone="blush"
        kind="introduced"
        buckets={data.introduced}
        afterId={afterId}
      />
      <RuleDeltas
        reductions={data.topRuleReductions}
        regressions={data.topRuleRegressions}
      />
    </main>
  )
}
