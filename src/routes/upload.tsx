import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { PdfUpload } from '#/components/PdfUpload'

export const Route = createFileRoute('/upload')({ component: UploadPage })

function UploadPage() {
  const navigate = useNavigate()
  const [result, setResult] = useState<{
    jobId: string
    totalPages: number
    scannedWarning: boolean
  } | null>(null)

  const handleComplete = useCallback(
    (data: {
      jobId: string
      totalPages: number
      scannedWarning: boolean
    }) => {
      setResult(data)
    },
    [],
  )

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in mx-auto max-w-xl rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <p className="island-kicker mb-3">Step 1 of 3</p>
        <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
          Upload Your Thesis
        </h1>
        <p className="mb-8 text-sm text-[var(--sea-ink-soft)]">
          Upload a PDF and we'll extract the text from every page, parse your
          citations, and trace them back to their source.
        </p>

        <PdfUpload onComplete={handleComplete} />

        {result && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() =>
                navigate({
                  to: '/upload',
                  search: { jobId: result.jobId },
                })
              }
              className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
            >
              Continue to Citation Parsing →
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
