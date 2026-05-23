import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PdfUpload } from '#/components/PdfUpload'
import { CitationsTable } from '#/components/CitationsTable'
import { Button } from '#/components/ui/button'
import type { GroupedCitation } from '#/services/citation-parser'

export const Route = createFileRoute('/upload')({ component: UploadPage })

type Step =
  | { phase: 'upload' }
  | { phase: 'parsing'; jobId: string }
  | {
      phase: 'review'
      jobId: string
      totalCitations: number
      uniqueCitations: number
      citations: GroupedCitation[]
    }
  | { phase: 'error'; jobId: string; message: string }

function UploadPage() {
  const [step, setStep] = useState<Step>({ phase: 'upload' })

  const handleUploadComplete = useCallback(
    async (data: {
      jobId: string
      totalPages: number
      scannedWarning: boolean
    }) => {
      setStep({ phase: 'parsing', jobId: data.jobId })

      try {
        const { parseCitationsForJob } = await import('#/services/citations')
        const result = await parseCitationsForJob({
          data: { jobId: data.jobId },
        })

        setStep({
          phase: 'review',
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

  const stepNumber =
    step.phase === 'upload' ? 1 : step.phase === 'parsing' ? 2 : 2
  const stepLabel =
    step.phase === 'upload'
      ? 'Upload Your Thesis'
      : step.phase === 'parsing'
        ? 'Parsing Citations...'
        : 'Review Citations'

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section
        className={`island-shell rise-in mx-auto rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14 ${
          step.phase === 'review' ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <p className="island-kicker mb-3">Step {stepNumber} of 3</p>
        <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
          {stepLabel}
        </h1>

        {step.phase === 'upload' && (
          <>
            <p className="mb-8 text-sm text-[var(--sea-ink-soft)]">
              Upload a PDF and we'll extract the text from every page, then
              parse all in-text citations automatically.
            </p>
            <PdfUpload onComplete={handleUploadComplete} />
          </>
        )}

        {step.phase === 'parsing' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--lagoon)]" />
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Scanning for in-text citations...
            </p>
          </div>
        )}

        {step.phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
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

        {step.phase === 'review' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-[var(--sea-ink-soft)]">
              We found {step.totalCitations} citation occurrences across{' '}
              {step.uniqueCitations} unique sources. Review them below, then
              continue to reference matching.
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
              <Button disabled>Continue to Reference Matching →</Button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
