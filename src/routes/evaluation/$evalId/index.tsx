import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useMemo } from 'react'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { evaluationReportSearchSchema } from '#/schemas/evaluation'
import { filterFindings } from '#/lib/evaluation/filter'
import { stageState } from '#/lib/evaluation/utils'
import { getEvaluationReport } from '#/services/evaluation/report'
import {
  bulkSetFindingsResolved,
  setFindingResolved,
} from '#/services/evaluation/findings'
import {
  listVocabulary,
  setVocabularyEntry,
  type VocabClassification,
} from '#/services/evaluation/vocabulary'
import { useEvaluationFilters } from './-hooks/use-evaluation-filters'
import { usePreviewSelection } from './-hooks/use-preview-selection'
import { useCategoryFocus } from './-hooks/use-category-focus'
import { EvaluationLoadingView } from './-sections/evaluation-loading'
import { EvaluationErrorView } from './-sections/evaluation-error'
import { EvaluationHeader } from './-sections/evaluation-header'
import { EvaluationFilters } from './-sections/evaluation-filters'
import { EydMarginalia } from './-sections/eyd-marginalia'
import { PipelineCard } from './-sections/pipeline-card'
import { CategorySection } from './-sections/category-section'

const evaluationReportQuery = (evalId: string) =>
  queryOptions({
    queryKey: ['evaluation-report', evalId] as const,
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
  })

const evaluationVocabularyQuery = queryOptions({
  queryKey: ['evaluation-vocabulary'] as const,
  queryFn: () => listVocabulary(),
  staleTime: 30_000,
})

export const Route = createFileRoute('/evaluation/$evalId/')({
  validateSearch: zodValidator(evaluationReportSearchSchema),
  loader: async ({ context: { queryClient }, params: { evalId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(evaluationReportQuery(evalId)),
      queryClient.ensureQueryData(evaluationVocabularyQuery),
    ])
  },
  head: () => ({
    meta: [
      { title: 'Laporan evaluation · CiteTrack' },
      {
        name: 'description',
        content:
          'Temuan KBBI dan EYD dari naskah skripsi yang diunggah, lengkap dengan halaman dan saran perbaikannya.',
      },
    ],
  }),
  component: EvaluationReportPage,
  pendingComponent: EvaluationLoadingView,
  errorComponent: ({ error }) => <EvaluationErrorView error={error} />,
})

function EvaluationReportPage() {
  const { evalId } = Route.useParams()
  const { highlights } = Route.useSearch()
  const navigate = useNavigate()
  const filters = useEvaluationFilters()
  const preview = usePreviewSelection({ initialHighlightsParam: highlights })
  const focus = useCategoryFocus()

  const queryClient = useQueryClient()

  const { data, isPending, isError, error } = useQuery({
    ...evaluationReportQuery(evalId),
    refetchInterval: (q) => {
      if (q.state.status === 'error') return false
      const status = q.state.data?.job.status
      if (status === 'done' || status === 'failed') return false
      return 1500
    },
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message : ''
      if (/not found|tidak ditemukan/i.test(msg)) return false
      return failureCount < 3
    },
  })

  const { data: vocabEntries } = useQuery(evaluationVocabularyQuery)

  const vocabMap = useMemo(() => {
    const map = new Map<string, VocabClassification>()
    for (const entry of vocabEntries ?? []) {
      map.set(entry.word.toLowerCase(), entry.classification)
    }
    return map
  }, [vocabEntries])

  const classifyMutation = useMutation({
    mutationFn: (input: { word: string; classification: VocabClassification }) =>
      setVocabularyEntry({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-vocabulary'] })
    },
  })

  const handleClassify = useCallback(
    (word: string, classification: VocabClassification) => {
      classifyMutation.mutate({ word, classification })
    },
    [classifyMutation],
  )

  const resolveMutation = useMutation({
    mutationFn: (input: { findingId: number; resolved: boolean }) =>
      setFindingResolved({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-report', evalId] })
    },
  })

  const handleToggleResolved = useCallback(
    (findingId: number, resolved: boolean) => {
      resolveMutation.mutate({ findingId, resolved })
    },
    [resolveMutation],
  )

  const bulkResolveMutation = useMutation({
    mutationFn: (input: { findingIds: number[]; resolved: boolean }) =>
      bulkSetFindingsResolved({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-report', evalId] })
    },
  })

  const handleFindingJump = useCallback(
    (page: number, highlight?: string) => {
      preview.jumpToFinding(page, highlight)
      if (highlight) {
        void navigate({
          to: '/evaluation/$evalId',
          params: { evalId },
          search: { highlights: `p.${page};${highlight}` },
          replace: true,
          resetScroll: false,
        })
      }
    },
    [preview, navigate, evalId],
  )

  const liveCounts = useMemo(() => {
    if (!data) return null
    const { job, findings } = data
    const status = job.status
    const running =
      status === 'pending' || status === 'extracting' || status === 'analyzing'
    if (!running) return null
    const counts = { kbbi: 0, eyd: 0 }
    for (const f of findings) counts[f.category]++
    return {
      kbbi: job.kbbiTotal > 0 ? counts.kbbi : null,
      eyd: job.eydTotal > 0 ? counts.eyd : null,
    }
  }, [data])

  if (isPending) return <EvaluationLoadingView />
  if (isError) return <EvaluationErrorView error={error} />

  const { job, summary, findings } = data
  const status = job.status
  const isRunning =
    status === 'pending' || status === 'extracting' || status === 'analyzing'
  const isDone = status === 'done'

  return (
    <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 pb-12 pt-10 sm:px-10 bg-[var(--bg-cream)]">
      <EvaluationHeader
        filename={job.filename}
        totalPages={job.totalPages}
        isRunning={isRunning}
        isDone={isDone}
        evalId={evalId}
        findings={findings}
        summary={summary}
        durationMs={job.durationMs ?? null}
        onJumpCategory={focus.focusCategory}
      />

      {isRunning && (
        <div className="mb-10 flex flex-col gap-8">
          <PipelineCard job={job} />
          <EydMarginalia />
        </div>
      )}

      {status === 'failed' && (
        <div className="mb-8 border-l-2 border-[var(--destructive)] py-1 pl-5">
          <p className="kicker text-[var(--destructive)]">Analisis gagal</p>
          <p className="mt-1 text-sm text-[var(--sea-ink)]">
            {job.error ?? 'Terjadi kesalahan yang tidak diketahui.'}
          </p>
        </div>
      )}

      {isDone && (() => {
        const visible = filterFindings(
          findings,
          {
            ...filters.parsedFilter,
            includeResolved: true,
          },
          vocabMap,
        )
        const visibleUnresolvedIds = visible
          .filter((f) => f.resolvedAt === null)
          .map((f) => f.id)
        const visibleResolvedIds = visible
          .filter((f) => f.resolvedAt !== null)
          .map((f) => f.id)
        return (
          <EvaluationFilters
            tagFilter={filters.tagFilter}
            onTagFilterChange={filters.setTagFilter}
            typeFilter={filters.typeFilter}
            onTypeFilterChange={filters.setTypeFilter}
            query={filters.query}
            onQueryChange={filters.setQuery}
            includeResolved={filters.includeResolved}
            onIncludeResolvedChange={filters.setIncludeResolved}
            resolvedCount={findings.filter((f) => f.resolvedAt !== null).length}
            visibleUnresolvedCount={visibleUnresolvedIds.length}
            visibleResolvedCount={visibleResolvedIds.length}
            onBulkResolve={() =>
              visibleUnresolvedIds.length > 0 &&
              bulkResolveMutation.mutate({
                findingIds: visibleUnresolvedIds,
                resolved: true,
              })
            }
            onBulkRestore={() =>
              visibleResolvedIds.length > 0 &&
              bulkResolveMutation.mutate({
                findingIds: visibleResolvedIds,
                resolved: false,
              })
            }
            bulkPending={bulkResolveMutation.isPending}
          />
        )
      })()}

      {(isRunning || isDone) && (
        <ReviewWithPreview
          jobId={evalId}
          pdfUrl={`/api/evaluation-pdf/${evalId}`}
          currentPage={preview.previewPage}
          onPageChange={preview.handlePreviewPageChange}
          highlight={preview.previewHighlight}
        >
          <div className="flex flex-col gap-10 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            <CategorySection
              category="eyd"
              findings={findings}
              filter={filters.parsedFilter}
              isLive={stageState(job, 'eyd') === 'running'}
              liveCount={liveCounts?.eyd ?? null}
              onEvaluationFindingClick={handleFindingJump}
              vocabMap={vocabMap}
              onClassify={handleClassify}
              onToggleResolved={handleToggleResolved}
              open={focus.openCategories.eyd}
              onOpenChange={(next) => focus.setCategoryOpen('eyd', next)}
              highlighted={focus.highlightedCategory === 'eyd'}
              onHighlightEnd={focus.clearHighlight}
            />
            <CategorySection
              category="kbbi"
              findings={findings}
              filter={filters.parsedFilter}
              isLive={stageState(job, 'kbbi') === 'running'}
              liveCount={liveCounts?.kbbi ?? null}
              onEvaluationFindingClick={handleFindingJump}
              vocabMap={vocabMap}
              onClassify={handleClassify}
              onToggleResolved={handleToggleResolved}
              open={focus.openCategories.kbbi}
              onOpenChange={(next) => focus.setCategoryOpen('kbbi', next)}
              highlighted={focus.highlightedCategory === 'kbbi'}
              onHighlightEnd={focus.clearHighlight}
            />
          </div>
        </ReviewWithPreview>
      )}
    </main>
  )
}
