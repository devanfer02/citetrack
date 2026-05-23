import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Lightbulb } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { getEvaluationReport } from '#/services/evaluation/report'
import {
  listVocabulary,
  setVocabularyEntry,
  type VocabClassification,
} from '#/services/evaluation/vocabulary'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { EYD_TIPS } from '#/lib/evaluation/constants'
import { parseEvaluationFilter } from '#/lib/evaluation/filter'
import { downloadCsv } from '#/lib/evaluation/utils'
import { PipelineCard } from './-sections/pipeline-card'
import { CategorySection } from './-sections/category-section'

export const Route = createFileRoute('/evaluation/$evalId/')({
  component: EvaluationReportPage,
})

function EydTipBanner() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * EYD_TIPS.length),
  )

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % EYD_TIPS.length),
      5000,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--foam)]/40 px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lagoon)]" />
      <p
        key={index}
        className="text-sm text-foreground transition-opacity duration-500"
      >
        <span className="font-medium text-muted-foreground">
          Tahukah kamu?{' '}
        </span>
        {EYD_TIPS[index]}
      </p>
    </div>
  )
}

function EvaluationReportPage() {
  const { evalId } = Route.useParams()
  const [filter, setFilter] = useState('')
  const debouncedFilter = useDebouncedValue(filter, 200)
  const parsedFilter = useMemo(
    () => parseEvaluationFilter(debouncedFilter),
    [debouncedFilter],
  )
  const [previewPage, setPreviewPage] = useState(1)
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(null)

  const jumpToEvaluationFinding = useCallback(
    (page: number, highlight?: string) => {
      setPreviewPage(page)
      setPreviewHighlight(highlight ?? null)
    },
    [],
  )
  const handlePreviewPageChange = useCallback((page: number) => {
    setPreviewPage(page)
    setPreviewHighlight(null)
  }, [])

  const queryClient = useQueryClient()

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['evaluation-report', evalId],
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status
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
    const counts = { kbbi: 0, eyd: 0, filkom: 0 }
    for (const f of findings) counts[f.category]++
    return {
      kbbi:
        current === 'kbbi' || (current === 'eyd' && job.kbbiTotal > 0)
          ? counts.kbbi
          : null,
      eyd: current === 'eyd' ? counts.eyd : null,
      filkom: job.filkomDone ? counts.filkom : null,
    }
  }, [data])

  if (isPending) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 pb-8 pt-8">
        <div
          aria-hidden
          className="doc-scan relative w-full max-w-xs overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-6 py-5 shadow-sm"
        >
          <div className="flex flex-col gap-2.5">
            <div className="h-3 w-5/6 rounded-full bg-muted-foreground/15" />
            <div className="h-3 w-4/6 rounded-full bg-muted-foreground/15" />
            <div className="h-3 w-full rounded-full bg-muted-foreground/15" />
            <div className="h-3 w-3/4 rounded-full bg-muted-foreground/15" />
            <div className="h-3 w-5/6 rounded-full bg-muted-foreground/15" />
            <div className="h-3 w-2/3 rounded-full bg-muted-foreground/15" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Reading your thesis…
        </p>
      </main>
    )
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load evaluation.'}
        </p>
      </main>
    )
  }

  const { job, summary, findings } = data
  const status = job.status
  const isRunning =
    status === 'pending' || status === 'extracting' || status === 'analyzing'
  const isDone = status === 'done'

  return (
    <main className="mx-auto max-w-[90rem] px-4 pb-8 pt-8">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="display-title text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Evaluation Report
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="truncate font-mono text-xs">{job.filename}</span>
          {' · '}
          {job.totalPages ?? '?'} pages
        </p>
      </header>

      {isRunning && (
        <div className="mb-6 flex flex-col gap-4">
          <PipelineCard job={job} />
          <EydTipBanner />
        </div>
      )}

      {status === 'failed' && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
          <p className="text-sm font-medium text-destructive-foreground">
            Analysis failed: {job.error ?? 'unknown error'}
          </p>
        </div>
      )}

      {isDone && summary && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">KBBI</p>
            <p className="text-2xl font-semibold">{summary.kbbiErrorCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">EYD</p>
            <p className="text-2xl font-semibold">{summary.eydErrorCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">FILKOM</p>
            <p className="text-2xl font-semibold">{summary.filkomErrorCount}</p>
          </div>
        </div>
      )}

      {isDone && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="tag:KBBI type:warning keyword…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-md"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(findings, `evaluation-${evalId}.csv`)}
              disabled={findings.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Filter by <code className="rounded bg-[var(--chip-bg)] px-1">tag:kbbi|eyd|filkom</code>,{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1">type:error|warning|info</code>,
            and free text.
          </p>
        </div>
      )}

      {(isRunning || isDone) && (
        <ReviewWithPreview
          jobId={evalId}
          pdfUrl={`/api/evaluation-pdf/${evalId}`}
          currentPage={previewPage}
          onPageChange={handlePreviewPageChange}
          highlight={previewHighlight}
        >
          <div className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-y-auto">
            <CategorySection
              category="filkom"
              findings={findings}
              filter={parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.filkom ?? null}
              onEvaluationFindingClick={jumpToEvaluationFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
            />
            <CategorySection
              category="kbbi"
              findings={findings}
              filter={parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.kbbi ?? null}
              onEvaluationFindingClick={jumpToEvaluationFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
            />
            <CategorySection
              category="eyd"
              findings={findings}
              filter={parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.eyd ?? null}
              onEvaluationFindingClick={jumpToEvaluationFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
            />
          </div>
        </ReviewWithPreview>
      )}
    </main>
  )
}
