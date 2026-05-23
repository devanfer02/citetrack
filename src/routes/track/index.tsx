import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PdfUpload } from '#/components/PdfUpload'
import { CitationsTable } from '#/components/CitationsTable'
import { ReferencesTable } from '#/components/ReferencesTable'
import { MatchingResults } from '#/components/MatchingResults'
import { PassageResults } from '#/components/PassageResults'
import { PipelineProgress } from '#/components/PipelineProgress'
import { ReviewWithPreview } from '#/components/ReviewWithPreview'
import { Section } from '#/components/Section'
import { Squiggle } from '#/components/doodles'
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
} from '#/lib/pipeline/queries'
import { pipelineSearchSchema } from '#/schemas/pipelineSearch'
import { usePipelineStore } from '#/stores/pipelineStore'
import { UploadSourcesPanel } from './-sections/upload-sources-panel'

export const Route = createFileRoute('/track/')({
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
  } = usePipelineStore()
  const setJobId = usePipelineStore((s) => s.setJobId)
  const setPhase = usePipelineStore((s) => s.setPhase)
  const setError = usePipelineStore((s) => s.setError)
  const setUpload = usePipelineStore((s) => s.setUpload)
  const setCitations = usePipelineStore((s) => s.setCitations)
  const setReferences = usePipelineStore((s) => s.setReferences)
  const setMatching = usePipelineStore((s) => s.setMatching)
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

  const handleMatchPassages = useCallback(async () => {
    if (!jobId) return
    setPhase('matching-passages')
    try {
      const { matchPassagesForJob } = await import('#/services/ai/passages')
      const result = await matchPassagesForJob({ data: { jobId } })
      setPassages({
        passageResults: result.results,
        matched: result.matched,
        noSource: result.noSource,
        noMatch: result.noMatch,
        total: result.total,
        avgConfidence: result.avgConfidence,
        durationMs: result.durationMs,
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
      ? 'Finding passages in your uploaded source PDFs…'
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
    <main className="flex-1">
      <Section
        tone="butter"
        innerClassName="relative pb-8 pt-12 sm:pt-16"
      >
        <Squiggle
          tone="coral"
          size={56}
          className="absolute right-[8%] top-8 hidden md:block"
        />
        <div className={`mx-auto w-full ${sectionMaxWidth}`}>
          <span className="kicker text-[var(--accent-coral-deep)]">
            Citation Tracer
          </span>
          <h1 className="display-title mt-3 text-[clamp(2rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
            {stepLabel}
          </h1>
        </div>
        <div className="mx-auto mt-10 w-full max-w-[44rem]">
          <PipelineProgress
            currentStep={stepNumber}
            maxReachedStep={maxReachedStep}
            onStepClick={handleStepClick}
          />
        </div>
      </Section>

      <section className={`mx-auto w-full min-w-0 px-6 pb-12 pt-10 sm:px-10 ${sectionMaxWidth}`}>
          {currentPhase === 'upload' && (
            <div className="mx-auto max-w-xl">
              <p className="mb-8 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                Unggah PDF skripsi. Setiap halaman akan diekstrak, dan sitasi
                dalam teks diurai otomatis sebelum kamu meninjaunya.
              </p>
              <PdfUpload onComplete={handleUploadComplete} />
            </div>
          )}

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
                {currentPhase === 'matching-passages' && (
                  <p className="mt-2 max-w-prose text-[0.875rem] italic leading-relaxed text-[var(--sea-ink-soft)]">
                    Bisa makan waktu beberapa menit, tergantung jumlah
                    referensi.
                  </p>
                )}
              </div>
            </aside>
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
