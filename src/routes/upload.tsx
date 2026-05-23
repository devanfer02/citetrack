import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PdfUpload } from '#/components/PdfUpload'
import { CitationsTable } from '#/components/CitationsTable'
import { ReferencesTable } from '#/components/ReferencesTable'
import { MatchingResults } from '#/components/MatchingResults'
import { SourceFetchResults } from '#/components/SourceFetchResults'
import { Button } from '#/components/ui/button'
import type { GroupedCitation } from '#/services/citation-parser'
import type { ParsedReference } from '#/services/reference-parser'
import type { MatchSummary } from '#/services/citation-matcher'
import type { SourceFetchResult } from '#/services/sources'

export const Route = createFileRoute('/upload')({ component: UploadPage })

type Step =
  | { phase: 'upload' }
  | { phase: 'parsing-citations'; jobId: string }
  | {
      phase: 'review-citations'
      jobId: string
      totalCitations: number
      uniqueCitations: number
      citations: GroupedCitation[]
    }
  | { phase: 'parsing-references'; jobId: string; citationData: CitationData }
  | {
      phase: 'review-references'
      jobId: string
      citationData: CitationData
      totalReferences: number
      references: ParsedReference[]
    }
  | {
      phase: 'matching'
      jobId: string
      citationData: CitationData
      referenceData: ReferenceData
    }
  | {
      phase: 'review-matches'
      jobId: string
      citationData: CitationData
      referenceData: ReferenceData
      matchSummary: MatchSummary
    }
  | {
      phase: 'fetching-sources'
      jobId: string
      matchSummary: MatchSummary
    }
  | {
      phase: 'review-sources'
      jobId: string
      matchSummary: MatchSummary
      sourceResults: SourceFetchResult[]
      found: number
      failed: number
      total: number
    }
  | { phase: 'error'; jobId: string; message: string }

interface CitationData {
  totalCitations: number
  uniqueCitations: number
  citations: GroupedCitation[]
}

interface ReferenceData {
  totalReferences: number
  references: ParsedReference[]
}

function UploadPage() {
  const [step, setStep] = useState<Step>({ phase: 'upload' })

  const handleUploadComplete = useCallback(
    async (data: {
      jobId: string
      totalPages: number
      scannedWarning: boolean
    }) => {
      setStep({ phase: 'parsing-citations', jobId: data.jobId })

      try {
        const { parseCitationsForJob } = await import('#/services/citations')
        const result = await parseCitationsForJob({
          data: { jobId: data.jobId },
        })

        setStep({
          phase: 'review-citations',
          jobId: result.jobId,
          totalCitations: result.totalCitations,
          uniqueCitations: result.uniqueCitations,
          citations: result.citations,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Citation parsing failed'
        setStep({ phase: 'error', jobId: data.jobId, message })
      }
    },
    [],
  )

  const handleParseReferences = useCallback(async () => {
    if (step.phase !== 'review-citations') return
    const { jobId, totalCitations, uniqueCitations, citations } = step
    const citationData = { totalCitations, uniqueCitations, citations }

    setStep({ phase: 'parsing-references', jobId, citationData })

    try {
      const { parseReferencesForJob } = await import('#/services/references')
      const result = await parseReferencesForJob({ data: { jobId } })

      setStep({
        phase: 'review-references',
        jobId,
        citationData,
        totalReferences: result.totalReferences,
        references: result.references,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Reference parsing failed'
      setStep({ phase: 'error', jobId, message })
    }
  }, [step])

  const handleMatchCitations = useCallback(async () => {
    if (step.phase !== 'review-references') return
    const { jobId, citationData, totalReferences, references } = step
    const referenceData = { totalReferences, references }

    setStep({ phase: 'matching', jobId, citationData, referenceData })

    try {
      const { matchCitationsForJob } = await import('#/services/matching')
      const matchSummary = await matchCitationsForJob({ data: { jobId } })

      setStep({
        phase: 'review-matches',
        jobId,
        citationData,
        referenceData,
        matchSummary,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Citation matching failed'
      setStep({ phase: 'error', jobId, message })
    }
  }, [step])

  const handleFetchSources = useCallback(async () => {
    if (step.phase !== 'review-matches') return
    const { jobId, matchSummary } = step

    setStep({ phase: 'fetching-sources', jobId, matchSummary })

    try {
      const { fetchSourcesForJob } = await import('#/services/sources')
      const result = await fetchSourcesForJob({ data: { jobId } })

      setStep({
        phase: 'review-sources',
        jobId,
        matchSummary,
        sourceResults: result.results,
        found: result.found,
        failed: result.failed,
        total: result.total,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Source fetching failed'
      setStep({ phase: 'error', jobId, message })
    }
  }, [step])

  const stepNumber =
    step.phase === 'upload'
      ? 1
      : step.phase === 'parsing-citations' ||
          step.phase === 'review-citations'
        ? 2
        : step.phase === 'parsing-references' ||
            step.phase === 'review-references'
          ? 3
          : step.phase === 'matching' || step.phase === 'review-matches'
            ? 4
            : 5

  const totalSteps = 5
  const stepLabel =
    step.phase === 'upload'
      ? 'Upload Your Thesis'
      : step.phase === 'parsing-citations'
        ? 'Parsing Citations...'
        : step.phase === 'review-citations'
          ? 'Review Citations'
          : step.phase === 'parsing-references'
            ? 'Parsing References...'
            : step.phase === 'review-references'
              ? 'Review References'
              : step.phase === 'matching'
                ? 'Matching Citations to References...'
                : step.phase === 'review-matches'
                  ? 'Citation Matching Results'
                  : step.phase === 'fetching-sources'
                    ? 'Fetching Source PDFs...'
                    : step.phase === 'review-sources'
                      ? 'Source PDF Results'
                      : 'Error'

  const isWide =
    step.phase === 'review-citations' ||
    step.phase === 'review-references' ||
    step.phase === 'review-matches' ||
    step.phase === 'review-sources'

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section
        className={`island-shell rise-in mx-auto rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14 ${
          isWide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        <p className="island-kicker mb-3">
          Step {stepNumber} of {totalSteps}
        </p>
        <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {stepLabel}
        </h1>

        {step.phase === 'upload' && (
          <>
            <p className="mb-8 text-sm text-muted-foreground">
              Upload a PDF and we'll extract the text from every page, then
              parse all in-text citations automatically.
            </p>
            <PdfUpload onComplete={handleUploadComplete} />
          </>
        )}

        {step.phase === 'parsing-citations' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Scanning for in-text citations...
            </p>
          </div>
        )}

        {step.phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
              <p className="text-sm font-medium text-destructive-foreground">
                {step.message}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setStep({ phase: 'upload' })}
            >
              Try Again
            </Button>
          </div>
        )}

        {step.phase === 'review-citations' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              We found {step.totalCitations} citation occurrences across{' '}
              {step.uniqueCitations} unique sources. Review them below, then
              continue to parse your reference list.
            </p>

            <CitationsTable
              citations={step.citations}
              totalCitations={step.totalCitations}
              uniqueCitations={step.uniqueCitations}
            />

            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setStep({ phase: 'upload' })}
              >
                Upload Another
              </Button>
              <Button onClick={handleParseReferences}>
                Parse References →
              </Button>
            </div>
          </div>
        )}

        {step.phase === 'parsing-references' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Detecting and parsing Daftar Pustaka...
            </p>
          </div>
        )}

        {step.phase === 'review-references' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              We parsed {step.totalReferences} references from your
              bibliography. Review them below.
            </p>

            <ReferencesTable
              references={step.references}
              totalReferences={step.totalReferences}
            />

            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  setStep({
                    phase: 'review-citations',
                    jobId: step.jobId,
                    ...step.citationData,
                  })
                }
              >
                ← Back to Citations
              </Button>
              <Button onClick={handleMatchCitations}>
                Match Citations →
              </Button>
            </div>
          </div>
        )}

        {step.phase === 'matching' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Matching citations to reference entries...
            </p>
          </div>
        )}

        {step.phase === 'review-matches' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Each citation has been matched to its reference entry. Review the
              results below, then fetch source PDFs.
            </p>

            <MatchingResults summary={step.matchSummary} />

            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  setStep({
                    phase: 'review-references',
                    jobId: step.jobId,
                    citationData: step.citationData,
                    ...step.referenceData,
                  })
                }
              >
                ← Back to References
              </Button>
              <Button onClick={handleFetchSources}>
                Fetch Source PDFs →
              </Button>
            </div>
          </div>
        )}

        {step.phase === 'fetching-sources' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Searching for source PDFs across DOI, Unpaywall, and Semantic
              Scholar...
            </p>
            <p className="text-xs text-muted-foreground/60">
              This may take a few minutes depending on how many references need
              fetching.
            </p>
          </div>
        )}

        {step.phase === 'review-sources' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Found {step.found} of {step.total} source PDFs.
              {step.failed > 0 &&
                ` ${step.failed} could not be found — these will need manual upload in a future version.`}
            </p>

            <SourceFetchResults
              results={step.sourceResults}
              found={step.found}
              failed={step.failed}
              total={step.total}
            />

            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setStep({ phase: 'upload' })}
              >
                Start Over
              </Button>
              <Button disabled>
                Continue to Passage Matching →
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
