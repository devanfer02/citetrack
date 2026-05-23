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
import { getErrorMessage } from '#/lib/utils'

export const Route = createFileRoute('/upload')({ component: UploadPage })

const PHASE_STEP: Record<PipelinePhase, number> = {
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

const PHASE_LABEL: Record<PipelinePhase, string> = {
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

const LOADING_MESSAGES: Partial<Record<PipelinePhase, string>> = {
  'parsing-citations': 'Scanning for in-text citations...',
  'parsing-references': 'Detecting and parsing Daftar Pustaka...',
  matching: 'Matching citations to reference entries...',
  'fetching-sources':
    'Searching for source PDFs across DOI, Unpaywall, and Semantic Scholar...',
  'matching-passages':
    'Using Claude AI to find exact passages in source PDFs...',
}

async function runPipelineStep<T>(
  setStep: (step: PipelineStep) => void,
  loadingStep: PipelineStep,
  serviceFn: () => Promise<T>,
  onSuccess: (result: T) => PipelineStep,
  jobId: string,
  fallbackMessage: string,
) {
  setStep(loadingStep)
  try {
    const result = await serviceFn()
    setStep(onSuccess(result))
  } catch (err) {
    setStep({ phase: 'error', jobId, message: getErrorMessage(err, fallbackMessage) })
  }
}

function UploadPage() {
  const [step, setStep] = useState<PipelineStep>({ phase: 'upload' })
  const navigate = useNavigate()

  const handleUploadComplete = useCallback(
    async (data: {
      jobId: string
      totalPages: number
      scannedWarning: boolean
    }) => {
      await runPipelineStep(
        setStep,
        { phase: 'parsing-citations', jobId: data.jobId },
        async () => {
          const { parseCitationsForJob } = await import('#/services/parser/citations')
          return parseCitationsForJob({ data: { jobId: data.jobId } })
        },
        (result) => ({
          phase: 'review-citations',
          jobId: result.jobId,
          totalCitations: result.totalCitations,
          uniqueCitations: result.uniqueCitations,
          citations: result.citations,
        }),
        data.jobId,
        'Citation parsing failed',
      )
    },
    [],
  )

  const handleParseReferences = useCallback(async () => {
    if (step.phase !== 'review-citations') return
    const { jobId, totalCitations, uniqueCitations, citations } = step
    const citationData = { totalCitations, uniqueCitations, citations }

    await runPipelineStep(
      setStep,
      { phase: 'parsing-references', jobId, citationData },
      async () => {
        const { parseReferencesForJob } = await import('#/services/parser/references')
        return parseReferencesForJob({ data: { jobId } })
      },
      (result) => ({
        phase: 'review-references',
        jobId,
        citationData,
        totalReferences: result.totalReferences,
        references: result.references,
      }),
      jobId,
      'Reference parsing failed',
    )
  }, [step])

  const handleMatchCitations = useCallback(async () => {
    if (step.phase !== 'review-references') return
    const { jobId, citationData, totalReferences, references } = step
    const referenceData = { totalReferences, references }

    await runPipelineStep(
      setStep,
      { phase: 'matching', jobId, citationData, referenceData },
      async () => {
        const { matchCitationsForJob } = await import('#/services/matcher/matching')
        return matchCitationsForJob({ data: { jobId } })
      },
      (matchSummary) => ({
        phase: 'review-matches',
        jobId,
        citationData,
        referenceData,
        matchSummary,
      }),
      jobId,
      'Citation matching failed',
    )
  }, [step])

  const handleFetchSources = useCallback(async () => {
    if (step.phase !== 'review-matches') return
    const { jobId, matchSummary } = step

    await runPipelineStep(
      setStep,
      { phase: 'fetching-sources', jobId, matchSummary },
      async () => {
        const { fetchSourcesForJob } = await import('#/services/pdf/sources')
        return fetchSourcesForJob({ data: { jobId } })
      },
      (result) => ({
        phase: 'review-sources',
        jobId,
        matchSummary,
        sourceResults: result.results,
        found: result.found,
        failed: result.failed,
        total: result.total,
      }),
      jobId,
      'Source fetching failed',
    )
  }, [step])

  const handleMatchPassages = useCallback(async () => {
    if (step.phase !== 'review-sources') return
    const { jobId } = step

    await runPipelineStep(
      setStep,
      { phase: 'matching-passages', jobId },
      async () => {
        const { matchPassagesForJob } = await import('#/services/ai/passages')
        return matchPassagesForJob({ data: { jobId } })
      },
      (result) => ({
        phase: 'review-passages',
        jobId,
        passageResults: result.results,
        matched: result.matched,
        noSource: result.noSource,
        noMatch: result.noMatch,
        total: result.total,
        avgConfidence: result.avgConfidence,
      }),
      jobId,
      'Passage matching failed',
    )
  }, [step])

  const stepNumber = PHASE_STEP[step.phase]
  const stepLabel = PHASE_LABEL[step.phase]
  const loadingMessage = LOADING_MESSAGES[step.phase]

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-8 pt-8">
      <div className="flex gap-6">
        {/* Sidebar — vertical progress */}
        <aside className="sticky top-20 hidden h-fit w-48 shrink-0 lg:block">
          <PipelineProgress currentStep={stepNumber} />
        </aside>

        {/* Content area */}
        <section className="min-w-0 flex-1">
          <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {stepLabel}
          </h1>

          {step.phase === 'upload' && (
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
            <div className="mx-auto max-w-xl flex flex-col gap-4">
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
      </div>
    </main>
  )
}
