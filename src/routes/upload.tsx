import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PdfUpload } from '#/components/PdfUpload'
import { CitationsTable } from '#/components/CitationsTable'
import { ReferencesTable } from '#/components/ReferencesTable'
import { MatchingResults } from '#/components/MatchingResults'
import { SourceFetchResults } from '#/components/SourceFetchResults'
import { PassageResults } from '#/components/PassageResults'
import { PipelineProgress } from '#/components/PipelineProgress'
import { Button } from '#/components/ui/button'
import type { GroupedCitation } from '#/services/citation-parser'
import type { ParsedReference } from '#/services/reference-parser'
import type { MatchSummary } from '#/services/citation-matcher'
import type { SourceFetchResult } from '#/services/sources'
import type { PassageResult } from '#/services/passages'

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
  | {
      phase: 'matching-passages'
      jobId: string
    }
  | {
      phase: 'review-passages'
      jobId: string
      passageResults: PassageResult[]
      matched: number
      noSource: number
      noMatch: number
      total: number
      avgConfidence: number
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
  const navigate = useNavigate()

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

  const handleMatchPassages = useCallback(async () => {
    if (step.phase !== 'review-sources') return
    const { jobId } = step

    setStep({ phase: 'matching-passages', jobId })

    try {
      const { matchPassagesForJob } = await import('#/services/passages')
      const result = await matchPassagesForJob({ data: { jobId } })

      setStep({
        phase: 'review-passages',
        jobId,
        passageResults: result.results,
        matched: result.matched,
        noSource: result.noSource,
        noMatch: result.noMatch,
        total: result.total,
        avgConfidence: result.avgConfidence,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Passage matching failed'
      setStep({ phase: 'error', jobId, message })
    }
  }, [step])

  const phaseStep: Record<string, number> = {
    upload: 1,
    'parsing-citations': 2,
    'review-citations': 2,
    'parsing-references': 3,
    'review-references': 3,
    matching: 4,
    'review-matches': 4,
    'fetching-sources': 5,
    'review-sources': 5,
    'matching-passages': 6,
    'review-passages': 6,
    error: 0,
  }

  const phaseLabel: Record<string, string> = {
    upload: 'Upload Your Thesis',
    'parsing-citations': 'Parsing Citations...',
    'review-citations': 'Review Citations',
    'parsing-references': 'Parsing References...',
    'review-references': 'Review References',
    matching: 'Matching Citations to References...',
    'review-matches': 'Citation Matching Results',
    'fetching-sources': 'Fetching Source PDFs...',
    'review-sources': 'Source PDF Results',
    'matching-passages': 'Finding Passages with Claude AI...',
    'review-passages': 'Citation Trace Results',
    error: 'Error',
  }

  const stepNumber = phaseStep[step.phase] ?? 1
  const stepLabel = phaseLabel[step.phase] ?? ''
  const isWide = step.phase.startsWith('review-')

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section
        className={`island-shell rise-in mx-auto rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14 ${
          isWide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {stepNumber > 0 && (
          <PipelineProgress currentStep={stepNumber} />
        )}
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

        {(step.phase === 'parsing-citations' ||
          step.phase === 'parsing-references' ||
          step.phase === 'matching' ||
          step.phase === 'fetching-sources' ||
          step.phase === 'matching-passages') && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {step.phase === 'parsing-citations' &&
                'Scanning for in-text citations...'}
              {step.phase === 'parsing-references' &&
                'Detecting and parsing Daftar Pustaka...'}
              {step.phase === 'matching' &&
                'Matching citations to reference entries...'}
              {step.phase === 'fetching-sources' &&
                'Searching for source PDFs across DOI, Unpaywall, and Semantic Scholar...'}
              {step.phase === 'matching-passages' &&
                'Using Claude AI to find exact passages in source PDFs...'}
            </p>
            {(step.phase === 'fetching-sources' ||
              step.phase === 'matching-passages') && (
              <p className="text-xs text-muted-foreground/60">
                This may take several minutes depending on the number of
                references.
              </p>
            )}
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
              {step.uniqueCitations} unique sources.
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

        {step.phase === 'review-references' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              We parsed {step.totalReferences} references from your bibliography.
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

        {step.phase === 'review-matches' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Each citation has been matched to its reference entry.
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

        {step.phase === 'review-sources' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Found {step.found} of {step.total} source PDFs.
              {step.failed > 0 &&
                ` ${step.failed} could not be found.`}
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
              <Button onClick={handleMatchPassages}>
                Find Passages with AI →
              </Button>
            </div>
          </div>
        )}

        {step.phase === 'review-passages' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              Claude AI traced {step.matched} of {step.total} citations to
              specific passages in their source PDFs
              {step.avgConfidence > 0 &&
                ` with ${Math.round(step.avgConfidence * 100)}% average confidence`}
              .
            </p>
            <PassageResults
              results={step.passageResults}
              matched={step.matched}
              noSource={step.noSource}
              noMatch={step.noMatch}
              total={step.total}
              avgConfidence={step.avgConfidence}
            />
            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setStep({ phase: 'upload' })}
              >
                Analyze Another Thesis
              </Button>
              <Button
                onClick={() =>
                  navigate({
                    to: '/results/$jobId',
                    params: { jobId: step.jobId },
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
