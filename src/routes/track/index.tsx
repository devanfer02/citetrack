import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PdfUpload } from '#/components/PdfUpload'
import { PublicModeNotice } from '#/components/PublicModeNotice'
import { CitationsTable } from '#/components/CitationsTable'
import { ReferencesTable } from '#/components/ReferencesTable'
import { MatchingResults } from '#/components/MatchingResults'
import { PassageResults } from '#/components/PassageResults'
import { PipelineProgress } from '#/components/PipelineProgress'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { HeroEyebrow } from '#/components/HeroEyebrow'
import { TrackFlowExplainer } from '#/components/TrackFlowExplainer'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  Arrow,
  DottedArc,
  Lightbulb,
  PaperPlane,
  Sparkles,
  Squiggle,
  StarBurst,
} from '#/components/doodles'
import { Button } from '#/components/ui/button'
import { formatDurationMs, getErrorMessage } from '#/lib/utils'
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
  sourceUploadsQuery,
} from '#/lib/pipeline/queries'
import { pipelineSearchSchema } from '#/schemas/pipelineSearch'
import { usePipelineStore } from '#/stores/pipelineStore'
import { UploadSourcesPanel } from './-sections/upload-sources-panel'
import { PassageBatchProgress } from './-sections/passage-batch-progress'

export const Route = createFileRoute('/track/')({
  component: UploadPage,
  head: () => ({
    meta: [
      { title: 'Track citations · CiteTrack' },
      {
        name: 'description',
        content:
          'Unggah PDF skripsi dan telusuri setiap sitasi sampai ke halaman dan kalimat di paper sumber.',
      },
      { property: 'og:title', content: 'Track citations · CiteTrack' },
      {
        property: 'og:description',
        content:
          'Unggah PDF skripsi dan telusuri setiap sitasi sampai ke halaman dan kalimat di paper sumber.',
      },
    ],
  }),
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
        'upload-sources',
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
    if (reached('upload-sources')) {
      prefetches.push(queryClient.ensureQueryData(sourceUploadsQuery(jobId)))
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
    upload,
    citations,
    references,
    matching,
    passages,
    passageBatchProgress,
  } = usePipelineStore()
  const setJobId = usePipelineStore((s) => s.setJobId)
  const setPhase = usePipelineStore((s) => s.setPhase)
  const setError = usePipelineStore((s) => s.setError)
  const setUpload = usePipelineStore((s) => s.setUpload)
  const setCitations = usePipelineStore((s) => s.setCitations)
  const setReferences = usePipelineStore((s) => s.setReferences)
  const setMatching = usePipelineStore((s) => s.setMatching)
  const setPassages = usePipelineStore((s) => s.setPassages)
  const initPassageBatches = usePipelineStore((s) => s.initPassageBatches)
  const updatePassageBatch = usePipelineStore((s) => s.updatePassageBatch)
  const replacePassageBatches = usePipelineStore(
    (s) => s.replacePassageBatches,
  )
  const clearPassageBatchProgress = usePipelineStore(
    (s) => s.clearPassageBatchProgress,
  )
  const reset = usePipelineStore((s) => s.reset)

  // One-shot guard shared by handleMatchPassages and the auto-resume effect.
  // Whoever runs first claims the (jobId, matching-passages) slot so the
  // other doesn't race a parallel loop against the same batches. Persists
  // across re-renders, resets on unmount — exactly what we want, since a
  // fresh mount (deep link, back from /history) should be allowed to fire
  // the resume.
  const passageLoopFiredFor = useRef<string | null>(null)

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
      durationMs?: number
    }) => {
      setJobId(data.jobId)
      setUpload({ totalPages: data.totalPages, durationMs: data.durationMs })
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
          durationMs: result.durationMs,
        })
        setPhase('review-citations')
      } catch (err) {
        setError(getErrorMessage(err, 'Citation parsing failed'))
      }
    },
    [setJobId, setUpload, setPhase, setCitations, setError],
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
        durationMs: result.durationMs,
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
      const result = await matchCitationsForJob({ data: { jobId } })
      setMatching({ matchSummary: result.summary, durationMs: result.durationMs })
      setPhase('review-matches')
    } catch (err) {
      setError(getErrorMessage(err, 'Citation matching failed'))
    }
  }, [jobId, setPhase, setMatching, setError])

  const handleUploadSources = useCallback(() => {
    if (!jobId) return
    setPhase('upload-sources')
  }, [jobId, setPhase])

  const finalizePassages = useCallback(
    (results: PassageResult[], startedAt: number) => {
      const matched = results.filter((r) => r.status === 'matched')
      const avgConfidence =
        matched.length > 0
          ? matched.reduce((sum, r) => sum + r.confidence, 0) /
            matched.length
          : 0
      setPassages({
        passageResults: results,
        matched: matched.length,
        noSource: results.filter((r) => r.status === 'no-source').length,
        noMatch: results.filter((r) => r.status === 'no-match').length,
        total: results.length,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        durationMs: Date.now() - startedAt,
      })
      setPhase('review-passages')
    },
    [setPassages, setPhase],
  )

  const handleMatchPassages = useCallback(async () => {
    if (!jobId) return
    // Claim the loop slot before the auto-resume effect can fire on the
    // setPhase below.
    passageLoopFiredFor.current = `${jobId}:matching-passages`
    setPhase('matching-passages')
    clearPassageBatchProgress()

    const startedAt = Date.now()
    try {
      const {
        enqueuePassageBatches,
        processPassageBatch,
      } = await import('#/services/ai/passages')

      const { batches, noSourceResults } = await enqueuePassageBatches({
        data: { jobId },
      })
      initPassageBatches(batches, noSourceResults)

      let allResults: PassageResult[] = [...noSourceResults]

      let anyFailed = false
      for (const batch of batches) {
        try {
          const { batch: updated, results } = await processPassageBatch({
            data: { jobId, batchIndex: batch.batchIndex },
          })
          allResults = [...allResults, ...results]
          updatePassageBatch(updated, results)
        } catch (err) {
          // The server fn already auto-retried once; persist the failure
          // status so the UI can offer a manual retry.
          anyFailed = true
          const message = getErrorMessage(err, 'Passage batch failed')
          updatePassageBatch({
            ...batch,
            status: 'failed',
            errorMessage: message,
          })
          // Keep processing remaining batches so a single bad source
          // doesn't block the rest.
        }
      }

      // Only advance to review when every batch landed successfully.
      // If any failed, hold the user on matching-passages so the retry
      // button stays visible.
      if (!anyFailed) {
        finalizePassages(allResults, startedAt)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Passage matching failed'))
    }
  }, [
    jobId,
    setPhase,
    setError,
    clearPassageBatchProgress,
    initPassageBatches,
    updatePassageBatch,
    finalizePassages,
  ])

  const handleRetryFailedBatches = useCallback(async () => {
    if (!jobId || !passageBatchProgress) return
    try {
      const {
        retryFailedPassageBatches,
        processPassageBatch,
      } = await import('#/services/ai/passages')

      const { batches: resetBatches } = await retryFailedPassageBatches({
        data: { jobId },
      })
      replacePassageBatches(resetBatches)

      const failedIndexes = passageBatchProgress.batches
        .filter((b) => b.status === 'failed')
        .map((b) => b.batchIndex)

      let newResults: PassageResult[] = []

      for (const idx of failedIndexes) {
        try {
          const { batch: updated, results } = await processPassageBatch({
            data: { jobId, batchIndex: idx },
          })
          newResults = [...newResults, ...results]
          updatePassageBatch(updated, results)
        } catch (err) {
          const message = getErrorMessage(err, 'Passage batch failed')
          const original = passageBatchProgress.batches.find(
            (b) => b.batchIndex === idx,
          )
          if (original) {
            updatePassageBatch({
              ...original,
              status: 'failed',
              errorMessage: message,
            })
          }
        }
      }

      // After retry attempt, if every batch is done, advance to review.
      // We read the latest state from the store inside finalizePassages.
      const latest = usePipelineStore.getState().passageBatchProgress
      if (latest && latest.batches.every((b) => b.status === 'done')) {
        finalizePassages(
          [...latest.results, ...newResults],
          latest.startedAt,
        )
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Retry failed'))
    }
  }, [
    jobId,
    passageBatchProgress,
    replacePassageBatches,
    updatePassageBatch,
    finalizePassages,
    setError,
  ])

  // Re-runs the batch loop against whatever state is already in the DB. Used
  // when the user navigates away mid-match (or reloads the page) and comes
  // back: the original handleMatchPassages closure is gone, but the batches
  // it enqueued are still there. processPassageBatch short-circuits on
  // already-done batches (returns their cached results), so it's safe to loop
  // over every batch — done ones come back instantly, pending ones get
  // processed.
  const handleResumeMatchPassages = useCallback(async () => {
    if (!jobId) return
    const startedAt = Date.now()
    try {
      const { getPassageMatchSnapshot, processPassageBatch } = await import(
        '#/services/ai/passages'
      )
      const { batches, noSourceResults } = await getPassageMatchSnapshot({
        data: { jobId },
      })
      if (batches.length === 0) {
        // No batches were ever enqueued for this job — user hit the URL
        // directly without going through upload-sources. Leave the page in
        // its starting state so the regular "Cocokkan kutipan" path takes
        // over when they get there.
        return
      }
      initPassageBatches(batches, noSourceResults)

      let allResults: PassageResult[] = [...noSourceResults]
      let anyFailed = false
      for (const batch of batches) {
        try {
          const { batch: updated, results } = await processPassageBatch({
            data: { jobId, batchIndex: batch.batchIndex },
          })
          allResults = [...allResults, ...results]
          updatePassageBatch(updated, results)
        } catch (err) {
          const message = getErrorMessage(err, 'Passage batch failed')
          // Another tab is currently processing this batch — don't mark it
          // failed; the other tab will finish it.
          if (message.includes('already running')) continue
          anyFailed = true
          updatePassageBatch({
            ...batch,
            status: 'failed',
            errorMessage: message,
          })
        }
      }

      if (!anyFailed) {
        finalizePassages(allResults, startedAt)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Passage matching failed'))
    }
  }, [
    jobId,
    initPassageBatches,
    updatePassageBatch,
    finalizePassages,
    setError,
  ])

  // Auto-resume passage matching when the user lands on the matching-passages
  // phase from a fresh mount (deep link, reload, or coming back from
  // /history). One-shot per (jobId, phase) pair so React's strict-mode
  // double-mount in dev doesn't fire it twice, and so handleMatchPassages
  // (which claims the same slot) doesn't race a parallel loop.
  useEffect(() => {
    if (!jobId) return
    if (currentPhase !== 'matching-passages') return
    const key = `${jobId}:matching-passages`
    if (passageLoopFiredFor.current === key) return
    passageLoopFiredFor.current = key
    void handleResumeMatchPassages()
  }, [jobId, currentPhase, handleResumeMatchPassages])

  const stepNumber = PHASE_STEP[currentPhase]
  const stepLabel = PHASE_LABEL[currentPhase]
  const maxReachedStep = (() => {
    if (passages) return 6
    if (currentPhase === 'upload-sources') return 5
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
  // Text the viewer should highlight on the current page (e.g. the citation
  // marker). Reset whenever the user drives the viewer directly via
  // next/prev/page-input so the prior highlight doesn't persist onto an
  // unrelated page.
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(null)
  const jumpToOccurrence = useCallback(
    (page: number, highlight?: string) => {
      setPreviewPage(page)
      setPreviewHighlight(highlight ?? null)
    },
    [],
  )
  const handleViewerPageChange = useCallback((page: number) => {
    setPreviewPage(page)
    setPreviewHighlight(null)
  }, [])
  const loadingMessage =
    currentPhase === 'matching-passages'
      ? // Rendered separately by the batch-progress panel when batches
        // are enqueued. Only show the prep message before enqueue lands.
        passageBatchProgress
        ? null
        : 'Menyiapkan antrian pencocokan kalimat…'
      : LOADING_MESSAGES[currentPhase]

  // Per-phase content width. Review-citations / review-references need the
  // full container so the table + PDF panel can sit side by side; other
  // phases read better in a narrower, centered column.
  const isWideReviewPhase =
    currentPhase === 'review-citations' || currentPhase === 'review-references'
  const isTablePhase =
    currentPhase === 'review-matches' ||
    currentPhase === 'upload-sources' ||
    currentPhase === 'review-passages'
  const sectionMaxWidth = isWideReviewPhase
    ? 'max-w-[100rem]'
    : isTablePhase
      ? 'max-w-[72rem]'
      : 'max-w-[44rem]'

  return (
    <main id="main-content" className="flex-1">
      <Section
        tone="butter"
        grid
        innerClassName="relative pb-10 pt-12 sm:pt-16"
      >
        <Squiggle
          tone="coral"
          size={56}
          className="absolute right-[7%] top-8 hidden md:block"
        />
        <PaperPlane
          tone="indigo"
          size={32}
          className="absolute right-[14%] top-12 rotate-[-12deg] hidden lg:block"
        />
        <DottedArc
          tone="coral"
          size={100}
          className="absolute right-[6%] top-[6.5rem] hidden lg:block"
        />
        <Lightbulb
          tone="yellow"
          size={42}
          className="absolute left-[4%] bottom-6 hidden md:block"
        />
        <Sparkles
          tone="coral"
          size={28}
          className="absolute left-[12%] top-10 hidden lg:block"
        />
        <Arrow
          tone="indigo"
          size={48}
          className="absolute left-[8%] top-[15rem] rotate-[8deg] hidden xl:block"
        />
        <StarBurst
          tone="coral"
          size={20}
          className="absolute right-[26%] bottom-12 hidden md:block"
        />

        <div className={`mx-auto w-full ${sectionMaxWidth}`}>
          <HeroEyebrow
            label="Pelacak sitasi"
            howItWorksHref={currentPhase === 'upload' ? '#cara-kerja' : null}
          />
          <h1 className="display-title mt-4 text-[clamp(2rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
            {stepLabel}
          </h1>
          <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
            Lacak setiap sitasi sampai ke{' '}
            <Marker tone="yellow">halaman dan kalimatnya</Marker> di paper
            sumber. Unggah skripsi untuk{' '}
            <AccentInk>memulai</AccentInk>.
          </p>
        </div>
        <div className="relative mx-auto mt-10 w-full max-w-[44rem]">
          <PipelineProgress
            currentStep={stepNumber}
            maxReachedStep={maxReachedStep}
            onStepClick={handleStepClick}
          />
        </div>
      </Section>

      <section className="section-band w-full" data-tone="cream" data-grid>
        {currentPhase === 'upload' ? (
          <div className="mx-auto w-full max-w-5xl px-6 pb-14 pt-10 sm:px-10">
            <div className="mx-auto max-w-xl">
              <PublicModeNotice />
              <p className="mb-8 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Unggah PDF skripsi. Tiap halaman akan dibaca dan sitasi dalam
                teks diurai sebelum kamu meninjaunya.
              </p>
              <PdfUpload onComplete={handleUploadComplete} />
            </div>
            <div className="mt-14 w-full">
              <TrackFlowExplainer />
            </div>
          </div>
        ) : (
        <div className={`mx-auto w-full min-w-0 px-6 pb-12 pt-10 sm:px-10 ${sectionMaxWidth}`}>
          {loadingMessage && (
            <aside className="grid grid-cols-[3.5rem_1fr] gap-x-5 py-10">
              <span
                aria-hidden
                className="marginalia-rule mt-1 h-[calc(100%-0.5rem)] w-px justify-self-end"
                data-severity="warning"
              />
              <div>
                <p className="island-kicker text-[var(--lagoon-deep)]">
                  <span className="dots-loop">
                    Sedang memeriksa<span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
                <p className="mt-2 display-title text-xl font-medium leading-snug text-foreground sm:text-2xl">
                  {loadingMessage}
                </p>
              </div>
            </aside>
          )}

          {currentPhase === 'matching-passages' && passageBatchProgress && (
            <PassageBatchProgress
              batches={passageBatchProgress.batches}
              startedAt={passageBatchProgress.startedAt}
              onRetryFailed={handleRetryFailedBatches}
            />
          )}

          {currentPhase === 'error' && (
            <div className="mx-auto max-w-xl">
              <aside className="grid grid-cols-[3.5rem_1fr] gap-x-5">
                <span
                  aria-hidden
                  className="marginalia-rule mt-1 h-[calc(100%-0.25rem)] w-px justify-self-end"
                  data-severity="error"
                />
                <div>
                  <p className="small-caps pageref text-xs text-[var(--destructive)]">
                    Terjadi kesalahan
                  </p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
                    {errorMessage}
                  </p>
                </div>
              </aside>
              <div className="mt-6">
                <Button type="button" onClick={() => reset()}>
                  Coba lagi
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
                </Button>
              </div>
            </div>
          )}

          {currentPhase === 'review-citations' && citations && jobId && (
            <div className="flex flex-col gap-8">
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Ditemukan{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {citations.totalCitations}
                </span>{' '}
                kemunculan sitasi dari{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {citations.uniqueCitations}
                </span>{' '}
                sumber unik. Klik sebuah baris untuk membuka halaman tempatnya
                muncul.
              </p>
              <StepTimings
                rows={[
                  { label: 'Ekstraksi teks PDF', ms: upload?.durationMs },
                  { label: 'Urai sitasi', ms: citations.durationMs },
                ]}
              />
              <ReviewWithPreview
                jobId={jobId}
                currentPage={previewPage}
                onPageChange={handleViewerPageChange}
                highlight={previewHighlight}
              >
                <CitationsTable
                  citations={citations.citations}
                  totalCitations={citations.totalCitations}
                  uniqueCitations={citations.uniqueCitations}
                  onRowExpand={jumpToOccurrence}
                />
              </ReviewWithPreview>
              <NavRow
                back={{ label: 'Mulai ulang dengan PDF lain', onClick: () => reset() }}
                next={{ label: 'Urai Daftar Pustaka', onClick: handleParseReferences }}
              />
            </div>
          )}

          {currentPhase === 'review-references' && references && jobId && (
            <div className="flex flex-col gap-8">
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Berhasil mengurai{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {references.totalReferences}
                </span>{' '}
                entri Daftar Pustaka. Buka baris untuk melihat tempatnya muncul
                di naskah.
              </p>
              <StepTimings
                rows={[
                  { label: 'Urai daftar pustaka', ms: references.durationMs },
                ]}
              />
              <ReviewWithPreview
                jobId={jobId}
                currentPage={previewPage}
                onPageChange={handleViewerPageChange}
                highlight={previewHighlight}
              >
                <ReferencesTable
                  references={references.references}
                  totalReferences={references.totalReferences}
                  onRowExpand={setPreviewPage}
                />
              </ReviewWithPreview>
              <NavRow
                back={{
                  label: '← Kembali ke sitasi',
                  onClick: () => setPhase('review-citations'),
                }}
                next={{
                  label: 'Cocokkan sitasi',
                  onClick: handleMatchCitations,
                }}
              />
            </div>
          )}

          {currentPhase === 'review-matches' && matching && (
            <div className="flex flex-col gap-8">
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Setiap sitasi telah dicocokkan ke entri Daftar Pustaka-nya.
                Periksa sebentar sebelum mengunggah PDF sumber.
              </p>
              <StepTimings
                rows={[
                  { label: 'Pencocokan sitasi', ms: matching.durationMs },
                ]}
              />
              <MatchingResults summary={matching.matchSummary} />
              <NavRow
                back={{
                  label: '← Kembali ke daftar pustaka',
                  onClick: () => setPhase('review-references'),
                }}
                next={{
                  label: 'Unggah PDF sumber',
                  onClick: handleUploadSources,
                }}
              />
            </div>
          )}

          {currentPhase === 'upload-sources' && jobId && (
            <UploadSourcesPanel
              jobId={jobId}
              onBack={() => setPhase('review-matches')}
              onReset={() => reset()}
              onMatchPassages={handleMatchPassages}
            />
          )}

          {currentPhase === 'review-passages' && passages && (
            <div className="flex flex-col gap-8">
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Berhasil menelusuri{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {passages.matched}
                </span>{' '}
                dari{' '}
                <span className="tabular-nums font-medium text-foreground">
                  {passages.total}
                </span>{' '}
                sitasi ke kalimat di paper sumber
                {passages.avgConfidence > 0 && (
                  <>
                    {' '}
                    dengan tingkat keyakinan rata-rata{' '}
                    <span className="tabular-nums font-medium text-foreground">
                      {Math.round(passages.avgConfidence * 100)}%
                    </span>
                  </>
                )}
                .
              </p>
              <StepTimings
                rows={[
                  { label: 'Pencocokan kalimat', ms: passages.durationMs },
                ]}
              />
              <PassageResults
                results={passages.passageResults}
                matched={passages.matched}
                noSource={passages.noSource}
                noMatch={passages.noMatch}
                total={passages.total}
                avgConfidence={passages.avgConfidence}
              />
              <NavRow
                back={{
                  label: '← Kembali ke unggah sumber',
                  onClick: () => setPhase('upload-sources'),
                }}
                tertiary={{
                  label: 'Mulai ulang',
                  onClick: () => reset(),
                }}
                next={{
                  label: 'Lihat laporan penuh',
                  onClick: () =>
                    jobId &&
                    navigate({
                      to: '/results/$jobId',
                      params: { jobId },
                    }),
                }}
              />
            </div>
          )}
        </div>
        )}
      </section>
    </main>
  )
}

interface StepTimingsProps {
  rows: Array<{ label: string; ms: number | undefined }>
}

function StepTimings({ rows }: StepTimingsProps) {
  const visible = rows
    .map((r) => ({ label: r.label, formatted: formatDurationMs(r.ms) }))
    .filter((r): r is { label: string; formatted: string } => r.formatted !== null)
  if (visible.length === 0) return null
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-[var(--sea-ink-soft)]">
      {visible.map((row) => (
        <div key={row.label} className="inline-flex items-baseline gap-1.5">
          <dt className="kicker">{row.label}</dt>
          <dd className="tabular-nums text-foreground">{row.formatted}</dd>
        </div>
      ))}
    </dl>
  )
}

interface NavRowProps {
  back?: { label: string; onClick: () => void }
  next?: { label: string; onClick: () => void }
  tertiary?: { label: string; onClick: () => void }
}

function NavRow({ back, next, tertiary }: NavRowProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--line)] pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {back && (
          <Button type="button" variant="ghost" size="sm" onClick={back.onClick}>
            {back.label}
          </Button>
        )}
        {tertiary && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={tertiary.onClick}
            className="text-[var(--ink-soft)]"
          >
            {tertiary.label}
          </Button>
        )}
      </div>
      {next && (
        <Button type="button" onClick={next.onClick}>
          {next.label}
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}
