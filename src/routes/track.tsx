import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { PdfUpload } from '#/components/PdfUpload'
import { CitationsTable } from '#/components/CitationsTable'
import { ReferencesTable } from '#/components/ReferencesTable'
import { MatchingResults } from '#/components/MatchingResults'
import { SourceFetchResults } from '#/components/SourceFetchResults'
import { PassageResults } from '#/components/PassageResults'
import { PipelineProgress } from '#/components/PipelineProgress'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { Button } from '#/components/ui/button'
import { getErrorMessage } from '#/lib/utils'
import {
  LOADING_MESSAGES,
  PHASE_LABEL,
  PHASE_STEP,
  STEP_TO_PHASE,
} from '#/lib/pipeline/phases'
import {
  citationsQuery,
  jobQuery,
  matchesQuery,
  referencesQuery,
} from '#/lib/pipeline/queries'
import { pipelineSearchSchema } from '#/schemas/pipelineSearch'
import { usePipelineStore } from '#/stores/pipelineStore'

export const Route = createFileRoute('/track')({
  component: UploadPage,
  validateSearch: zodValidator(pipelineSearchSchema),
  loaderDeps: ({ search: { jobId, phase } }) => ({ jobId, phase }),
  loader: async ({ context: { queryClient }, deps: { jobId, phase } }) => {
    if (!jobId) return { jobId: null }

    // The URL-authoritative phase tells us how far the user is in the
    // pipeline; prefetch every completed review phase up to that point so
    // Previous navigation is instant after a refresh.
    const prefetches: Array<Promise<unknown>> = [
      queryClient.ensureQueryData(jobQuery(jobId)),
    ]
    const reached = (p: PipelinePhase | undefined): boolean => {
      if (!phase) return false
      const order: PipelinePhase[] = [
        'upload',
        'parsing-citations',
        'review-citations',
        'parsing-references',
        'review-references',
        'matching',
        'review-matches',
        'fetching-sources',
        'review-sources',
        'matching-passages',
        'review-passages',
      ]
      return order.indexOf(phase) >= order.indexOf(p ?? 'upload')
    }
    if (reached('review-citations')) {
      prefetches.push(queryClient.ensureQueryData(citationsQuery(jobId)))
    }
    if (reached('review-references')) {
      prefetches.push(queryClient.ensureQueryData(referencesQuery(jobId)))
    }
    if (reached('review-matches')) {
      prefetches.push(queryClient.ensureQueryData(matchesQuery(jobId)))
    }
    await Promise.all(prefetches)
    return { jobId }
  },
})

function UploadPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { queryClient } = Route.useRouteContext()
  const {
    jobId,
    currentPhase,
    errorMessage,
    citations,
    references,
    matching,
    sources,
    passages,
  } = usePipelineStore()
  const setJobId = usePipelineStore((s) => s.setJobId)
  const setPhase = usePipelineStore((s) => s.setPhase)
  const setError = usePipelineStore((s) => s.setError)
  const setCitations = usePipelineStore((s) => s.setCitations)
  const setReferences = usePipelineStore((s) => s.setReferences)
  const setMatching = usePipelineStore((s) => s.setMatching)
  const setSources = usePipelineStore((s) => s.setSources)
  const setPassages = usePipelineStore((s) => s.setPassages)
  const reset = usePipelineStore((s) => s.reset)

  // Hydrate store from URL + loader-prefetched query cache. Runs on mount
  // and whenever the URL jobId/phase changes. No TanStack/Zustand hook can
  // watch the cache + URL together and populate a separate store, so an
  // effect is the right escape hatch here.
  useEffect(() => {
    if (!search.jobId) return
    setJobId(search.jobId)
    if (search.phase) setPhase(search.phase)
    if (!citations) {
      const cached = queryClient.getQueryData(citationsQuery(search.jobId).queryKey)
      if (cached) setCitations(cached)
    }
    if (!references) {
      const cached = queryClient.getQueryData(referencesQuery(search.jobId).queryKey)
      if (cached) setReferences(cached)
    }
    if (!matching) {
      const cached = queryClient.getQueryData(matchesQuery(search.jobId).queryKey)
      if (cached) setMatching({ matchSummary: cached })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jobId, search.phase])

  // Keep the URL in sync with the store so forward transitions and stepper
  // clicks yield shareable, refresh-safe URLs. Only syncs when the store's
  // (jobId, currentPhase) disagree with the URL to avoid a ping-pong with
  // the hydrate effect above.
  useEffect(() => {
    if (!jobId) return
    if (search.jobId === jobId && search.phase === currentPhase) return
    navigate({
      to: '/track',
      search: { jobId, phase: currentPhase },
      replace: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, currentPhase])

  const handleUploadComplete = useCallback(
    async (data: {
      jobId: string
      totalPages: number
      scannedWarning: boolean
    }) => {
      setJobId(data.jobId)
      setPhase('parsing-citations')
      try {
        const { parseCitationsForJob } = await import(
          '#/services/parser/citations'
        )
        const result = await parseCitationsForJob({ data: { jobId: data.jobId } })
        setCitations({
          totalCitations: result.totalCitations,
          uniqueCitations: result.uniqueCitations,
          citations: result.citations,
        })
        setPhase('review-citations')
      } catch (err) {
        setError(getErrorMessage(err, 'Citation parsing failed'))
      }
    },
    [setJobId, setPhase, setCitations, setError],
  )

  const handleParseReferences = useCallback(async () => {
    if (!jobId) return
    setPhase('parsing-references')
    try {
      const { parseReferencesForJob } = await import(
        '#/services/parser/references'
      )
      const result = await parseReferencesForJob({ data: { jobId } })
      setReferences({
        totalReferences: result.totalReferences,
        references: result.references,
      })
      setPhase('review-references')
    } catch (err) {
      setError(getErrorMessage(err, 'Reference parsing failed'))
    }
  }, [jobId, setPhase, setReferences, setError])

  const handleMatchCitations = useCallback(async () => {
    if (!jobId) return
    setPhase('matching')
    try {
      const { matchCitationsForJob } = await import(
        '#/services/matcher/matching'
      )
      const matchSummary = await matchCitationsForJob({ data: { jobId } })
      setMatching({ matchSummary })
      setPhase('review-matches')
    } catch (err) {
      setError(getErrorMessage(err, 'Citation matching failed'))
    }
  }, [jobId, setPhase, setMatching, setError])

  const handleFetchSources = useCallback(async () => {
    if (!jobId) return
    setPhase('fetching-sources')
    try {
      const { fetchSourcesForJob } = await import('#/services/pdf/sources')
      const result = await fetchSourcesForJob({ data: { jobId } })
      setSources({
        sourceResults: result.results,
        found: result.found,
        failed: result.failed,
        total: result.total,
      })
      setPhase('review-sources')
    } catch (err) {
      setError(getErrorMessage(err, 'Source fetching failed'))
    }
  }, [jobId, setPhase, setSources, setError])

  const strategyQuery = useQuery({
    queryKey: ['matcher-strategy'],
    queryFn: async () => {
      const { getMatcherStrategy } = await import('#/services/ai/passages')
      return getMatcherStrategy()
    },
    staleTime: Infinity,
  })
  const strategy = strategyQuery.data?.strategy
  const passageMatchingDisabled = strategy === 'none'

  const handleMatchPassages = useCallback(async () => {
    if (!jobId) return
    const { getMatcherStrategy, matchPassagesForJob } = await import(
      '#/services/ai/passages'
    )
    const { strategy: liveStrategy } = await getMatcherStrategy()
    if (liveStrategy === 'none') {
      setError(
        'Passage matching is disabled. Set MATCHER_STRATEGY to "api" or "agent" in .env.local and restart the dev server.',
      )
      return
    }
    // Pre-populate strategy so the loading screen can show it.
    setPassages({
      passageResults: [],
      matched: 0,
      noSource: 0,
      noMatch: 0,
      total: 0,
      avgConfidence: 0,
      matcherStrategy: liveStrategy,
    })
    setPhase('matching-passages')
    try {
      const result = await matchPassagesForJob({ data: { jobId } })
      setPassages({
        passageResults: result.results,
        matched: result.matched,
        noSource: result.noSource,
        noMatch: result.noMatch,
        total: result.total,
        avgConfidence: result.avgConfidence,
        matcherStrategy: result.matcherStrategy,
      })
      setPhase('review-passages')
    } catch (err) {
      setError(getErrorMessage(err, 'Passage matching failed'))
    }
  }, [jobId, setPhase, setPassages, setError])

  const stepNumber = PHASE_STEP[currentPhase]
  const stepLabel = PHASE_LABEL[currentPhase]
  const maxReachedStep = (() => {
    if (passages) return 6
    if (sources) return 5
    if (matching) return 4
    if (references) return 3
    if (citations) return 2
    if (jobId) return 1
    return 0
  })()
  const handleStepClick = useCallback(
    (step: number) => {
      const target = STEP_TO_PHASE[step]
      if (target) setPhase(target)
    },
    [setPhase],
  )

  // Shared current-page state for the PDF preview panel across review-
  // citations and review-references. Row expand sets it; the viewer's own
  // prev/next/jump controls update it via onPageChange.
  const [previewPage, setPreviewPage] = useState(1)
  const strategyLabel =
    (currentPhase === 'matching-passages' || currentPhase === 'review-passages') &&
    passages
      ? passages.matcherStrategy === 'agent'
        ? 'Claude Agent'
        : 'Claude API'
      : null
  const loadingMessage =
    currentPhase === 'matching-passages'
      ? `Using ${strategyLabel} to find exact passages in source PDFs...`
      : LOADING_MESSAGES[currentPhase]

  // Per-phase content width. Review-citations / review-references need the
  // full container so the table + PDF panel can sit side by side; other
  // phases read better in a narrower, centered column.
  const isWideReviewPhase =
    currentPhase === 'review-citations' || currentPhase === 'review-references'
  const isTablePhase =
    currentPhase === 'review-matches' ||
    currentPhase === 'review-sources' ||
    currentPhase === 'review-passages'
  const sectionMaxWidth = isWideReviewPhase
    ? 'max-w-[100rem]'
    : isTablePhase
      ? 'max-w-[72rem]'
      : 'max-w-[44rem]'

  return (
    <main className="mx-auto max-w-[100rem] px-6 pb-8 pt-8 sm:px-8 lg:px-12">
      {/* Horizontal progress — constrained width, centered */}
      <div className="mx-auto mb-8 w-full max-w-[44rem]">
        <PipelineProgress
          currentStep={stepNumber}
          maxReachedStep={maxReachedStep}
          onStepClick={handleStepClick}
        />
      </div>

      <section className={`mx-auto w-full min-w-0 ${sectionMaxWidth}`}>
          <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {stepLabel}
          </h1>

          {currentPhase === 'upload' && (
            <div className="mx-auto max-w-xl">
              <p className="mb-8 text-sm text-muted-foreground">
                Upload a PDF and we'll extract the text from every page, then
                parse all in-text citations automatically.
              </p>
              <PdfUpload onComplete={handleUploadComplete} />
            </div>
          )}

          {loadingMessage && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
              {(currentPhase === 'fetching-sources' ||
                currentPhase === 'matching-passages') && (
                <p className="text-xs text-muted-foreground/60">
                  This may take several minutes depending on the number of
                  references.
                </p>
              )}
            </div>
          )}

          {currentPhase === 'error' && (
            <div className="mx-auto max-w-xl flex flex-col gap-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
                <p className="text-sm font-medium text-destructive-foreground">
                  {errorMessage}
                </p>
              </div>
              <Button variant="outline" onClick={() => reset()}>
                Try Again
              </Button>
            </div>
          )}

          {currentPhase === 'review-citations' && citations && jobId && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                We found {citations.totalCitations} citation occurrences across{' '}
                {citations.uniqueCitations} unique sources. Expand a row to
                jump to that page of your thesis.
              </p>
              <ReviewWithPreview
                jobId={jobId}
                currentPage={previewPage}
                onPageChange={setPreviewPage}
              >
                <CitationsTable
                  citations={citations.citations}
                  totalCitations={citations.totalCitations}
                  uniqueCitations={citations.uniqueCitations}
                  onRowExpand={setPreviewPage}
                />
              </ReviewWithPreview>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => reset()}>
                  Analyze another thesis
                </Button>
                <Button onClick={handleParseReferences}>
                  Parse References →
                </Button>
              </div>
            </div>
          )}

          {currentPhase === 'review-references' && references && jobId && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                We parsed {references.totalReferences} references from your
                bibliography. Expand a row to see where it appears in the
                thesis.
              </p>
              <ReviewWithPreview
                jobId={jobId}
                currentPage={previewPage}
                onPageChange={setPreviewPage}
              >
                <ReferencesTable
                  references={references.references}
                  totalReferences={references.totalReferences}
                  onRowExpand={setPreviewPage}
                />
              </ReviewWithPreview>
              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setPhase('review-citations')}
                >
                  ← Back to Citations
                </Button>
                <Button onClick={handleMatchCitations}>
                  Match Citations →
                </Button>
              </div>
            </div>
          )}

          {currentPhase === 'review-matches' && matching && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                Each citation has been matched to its reference entry.
              </p>
              <MatchingResults summary={matching.matchSummary} />
              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => setPhase('review-references')}
                >
                  ← Back to References
                </Button>
                <Button onClick={handleFetchSources}>
                  Fetch Source PDFs →
                </Button>
              </div>
            </div>
          )}

          {currentPhase === 'review-sources' && sources && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                Found {sources.found} of {sources.total} source PDFs.
                {sources.failed > 0 && ` ${sources.failed} could not be found.`}
              </p>
              <SourceFetchResults
                results={sources.sourceResults}
                found={sources.found}
                failed={sources.failed}
                total={sources.total}
              />
              {passageMatchingDisabled && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Passage matching is turned off</AlertTitle>
                  <AlertDescription>
                    The next step uses Claude to find the exact passage each
                    citation refers to inside its source PDF. To enable it,
                    open{' '}
                    <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
                      .env.local
                    </code>
                    , set{' '}
                    <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
                      MATCHER_STRATEGY
                    </code>{' '}
                    to{' '}
                    <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
                      api
                    </code>{' '}
                    or{' '}
                    <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
                      agent
                    </code>
                    , add an{' '}
                    <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
                      ANTHROPIC_API_KEY
                    </code>
                    , then restart the dev server.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPhase('review-matches')}
                  >
                    ← Back to Matching
                  </Button>
                  <Button variant="ghost" onClick={() => reset()}>
                    Analyze another thesis
                  </Button>
                </div>
                <Button
                  onClick={handleMatchPassages}
                  disabled={passageMatchingDisabled}
                  title={
                    passageMatchingDisabled
                      ? 'Set MATCHER_STRATEGY in .env.local to enable'
                      : undefined
                  }
                >
                  Find Passages with AI →
                </Button>
              </div>
            </div>
          )}

          {currentPhase === 'review-passages' && passages && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                {strategyLabel} traced {passages.matched} of {passages.total}{' '}
                citations to specific passages in their source PDFs
                {passages.avgConfidence > 0 &&
                  ` with ${Math.round(passages.avgConfidence * 100)}% average confidence`}
                .
              </p>
              <PassageResults
                results={passages.passageResults}
                matched={passages.matched}
                noSource={passages.noSource}
                noMatch={passages.noMatch}
                total={passages.total}
                avgConfidence={passages.avgConfidence}
              />
              <div className="flex justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPhase('review-sources')}
                  >
                    ← Back to Source PDFs
                  </Button>
                  <Button variant="ghost" onClick={() => reset()}>
                    Analyze another thesis
                  </Button>
                </div>
                <Button
                  onClick={() =>
                    jobId &&
                    navigate({
                      to: '/results/$jobId',
                      params: { jobId },
                    })
                  }
                >
                  View Full Results →
                </Button>
              </div>
            </div>
          )}
      </section>
    </main>
  )
}
