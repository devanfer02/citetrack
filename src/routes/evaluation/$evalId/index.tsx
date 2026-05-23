import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { getEvaluationReport } from '#/services/evaluation/report'
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

export const Route = createFileRoute('/evaluation/$evalId/')({
  component: EvaluationReportPage,
})

function EvaluationReportPage() {
  const { evalId } = Route.useParams()
  const filters = useEvaluationFilters()
  const preview = usePreviewSelection()
  const focus = useCategoryFocus()

  const queryClient = useQueryClient()

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['evaluation-report', evalId],
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
    refetchInterval: (q) => {
      const status = q.state.data?.job.status
      if (status === 'done' || status === 'failed') return false
      return 1500
    },
  })

  const { data: vocabEntries } = useQuery({
    queryKey: ['evaluation-vocabulary'],
    queryFn: () => listVocabulary(),
    staleTime: 30_000,
  })

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

  const liveCounts = useMemo(() => {
    if (!data) return null
    const { job, findings } = data
    const status = job.status
    const running =
      status === 'pending' || status === 'extracting' || status === 'analyzing'
    if (!running) return null
    const current = job.currentStep
    const counts = { kbbi: 0, eyd: 0 }
    for (const f of findings) counts[f.category]++
    return {
      kbbi:
        current === 'kbbi' || (current === 'eyd' && job.kbbiTotal > 0)
          ? counts.kbbi
          : null,
      eyd: current === 'eyd' ? counts.eyd : null,
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
    <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 pb-12 pt-10 sm:px-10">
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

      {isDone && (
        <EvaluationFilters
          tagFilter={filters.tagFilter}
          onTagFilterChange={filters.setTagFilter}
          typeFilter={filters.typeFilter}
          onTypeFilterChange={filters.setTypeFilter}
          query={filters.query}
          onQueryChange={filters.setQuery}
        />
      )}

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
              category="kbbi"
              findings={findings}
              filter={filters.parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.kbbi ?? null}
              onEvaluationFindingClick={preview.jumpToFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
              open={focus.openCategories.kbbi}
              onOpenChange={(next) => focus.setCategoryOpen('kbbi', next)}
              highlighted={focus.highlightedCategory === 'kbbi'}
              onHighlightEnd={focus.clearHighlight}
            />
            <CategorySection
              category="eyd"
              findings={findings}
              filter={filters.parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.eyd ?? null}
              onEvaluationFindingClick={preview.jumpToFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
              open={focus.openCategories.eyd}
              onOpenChange={(next) => focus.setCategoryOpen('eyd', next)}
              highlighted={focus.highlightedCategory === 'eyd'}
              onHighlightEnd={focus.clearHighlight}
            />
          </div>
        </ReviewWithPreview>
      )}
    </main>
  )
}
