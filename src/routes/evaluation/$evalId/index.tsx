import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Lightbulb } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { getEvaluationReport } from '#/services/evaluation/report'
import {
  listVocabulary,
  setVocabularyEntry,
  type VocabClassification,
} from '#/services/evaluation/vocabulary'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { EYD_TIPS } from '#/lib/evaluation/constants'
import type { ParsedFilter } from '#/lib/evaluation/filter'
import { downloadCsv } from '#/lib/evaluation/utils'

type TagFilter = EvaluationCategory | 'all'
type TypeFilter = EvaluationFinding['severity'] | 'all'
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
  const [tagFilter, setTagFilter] = useState<TagFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 200)
  const parsedFilter = useMemo<ParsedFilter>(
    () => ({
      categories:
        tagFilter === 'all'
          ? new Set<EvaluationCategory>()
          : new Set<EvaluationCategory>([tagFilter]),
      severities:
        typeFilter === 'all'
          ? new Set<EvaluationFinding['severity']>()
          : new Set<EvaluationFinding['severity']>([typeFilter]),
      query: debouncedQuery.trim().toLowerCase(),
    }),
    [tagFilter, typeFilter, debouncedQuery],
  )
  const [previewPage, setPreviewPage] = useState(1)
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(null)
  const [openCategories, setOpenCategories] = useState<
    Record<EvaluationCategory, boolean>
  >({ filkom: true, kbbi: true, eyd: true })
  const [highlightedCategory, setHighlightedCategory] =
    useState<EvaluationCategory | null>(null)

  const setCategoryOpen = useCallback(
    (category: EvaluationCategory, next: boolean) => {
      setOpenCategories((s) => ({ ...s, [category]: next }))
    },
    [],
  )

  const focusCategory = useCallback((category: EvaluationCategory) => {
    setOpenCategories((s) => ({ ...s, [category]: true }))
    setHighlightedCategory(category)
    requestAnimationFrame(() => {
      document
        .getElementById(`category-${category}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

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
    const counts = { kbbi: 0, eyd: 0, filkom: 0 }
    for (const f of findings) counts[f.category]++
    return {
      kbbi:
        current === 'kbbi' || (current === 'eyd' && job.kbbiTotal > 0)
          ? counts.kbbi
          : null,
      eyd: current === 'eyd' ? counts.eyd : null,
      filkom: job.enableFilkom && job.filkomDone ? counts.filkom : null,
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
        <div
          className={`mb-6 grid gap-3 ${job.enableFilkom ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          <SummaryCard
            label="KBBI"
            value={summary.kbbiErrorCount}
            onClick={() => focusCategory('kbbi')}
          />
          <SummaryCard
            label="EYD"
            value={summary.eydErrorCount}
            onClick={() => focusCategory('eyd')}
          />
          {job.enableFilkom && (
            <SummaryCard
              label="FILKOM"
              value={summary.filkomErrorCount}
              onClick={() => focusCategory('filkom')}
            />
          )}
        </div>
      )}

      {isDone && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select
            value={tagFilter}
            onValueChange={(v) => setTagFilter(v as TagFilter)}
          >
            <SelectTrigger className="w-[9rem]" aria-label="Filter by tag">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              <SelectItem value="kbbi">KBBI</SelectItem>
              <SelectItem value="eyd">EYD</SelectItem>
              <SelectItem value="filkom">FILKOM</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TypeFilter)}
          >
            <SelectTrigger className="w-[9rem]" aria-label="Filter by type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search keyword…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
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
            {job.enableFilkom && (
              <CategorySection
                category="filkom"
                findings={findings}
                filter={parsedFilter}
                isLive={isRunning}
                liveCount={liveCounts?.filkom ?? null}
                onEvaluationFindingClick={jumpToEvaluationFinding}
                vocabMap={vocabMap}
                onClassify={handleClassify}
                open={openCategories.filkom}
                onOpenChange={(next) => setCategoryOpen('filkom', next)}
                highlighted={highlightedCategory === 'filkom'}
                onHighlightEnd={() => setHighlightedCategory(null)}
              />
            )}
            <CategorySection
              category="kbbi"
              findings={findings}
              filter={parsedFilter}
              isLive={isRunning}
              liveCount={liveCounts?.kbbi ?? null}
              onEvaluationFindingClick={jumpToEvaluationFinding}
              vocabMap={vocabMap}
              onClassify={handleClassify}
              open={openCategories.kbbi}
              onOpenChange={(next) => setCategoryOpen('kbbi', next)}
              highlighted={highlightedCategory === 'kbbi'}
              onHighlightEnd={() => setHighlightedCategory(null)}
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
              open={openCategories.eyd}
              onOpenChange={(next) => setCategoryOpen('eyd', next)}
              highlighted={highlightedCategory === 'eyd'}
              onHighlightEnd={() => setHighlightedCategory(null)}
            />
          </div>
        </ReviewWithPreview>
      )}
    </main>
  )
}

function SummaryCard({
  label,
  value,
  onClick,
}: {
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </button>
  )
}
