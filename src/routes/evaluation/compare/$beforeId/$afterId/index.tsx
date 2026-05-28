import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { Section } from '#/components/Section'
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
  errorComponent: ({ error }) => <CompareErrorView error={error} />,
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
    <main id="main-content" className="flex-1">
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

function CompareErrorView({ error }: { error: Error }) {
  return (
    <main id="main-content" className="flex-1">
      <Section tone="blush" innerClassName="py-16">
        <p className="kicker text-[var(--accent-coral-deep)]">
          Perbandingan gagal dibuka
        </p>
        <h1 className="display-title mt-2 text-2xl font-extrabold text-[var(--ink)]">
          {error.message || 'Terjadi kesalahan yang tidak diketahui.'}
        </h1>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Pastikan kedua evaluation sudah selesai dan berbeda satu sama lain,
          lalu coba pilih ulang dari riwayat.
        </p>
        <Link
          to="/history"
          search={{ kind: 'evaluation' }}
          className="mt-5 inline-flex items-baseline gap-1.5 border-b border-[var(--ink)] pb-1 text-[0.9375rem] font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent-coral-deep)] hover:text-[var(--accent-coral-deep)]"
        >
          Kembali ke riwayat
        </Link>
      </Section>
    </main>
  )
}
