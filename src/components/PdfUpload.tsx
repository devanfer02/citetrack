import { useCallback, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { DevFixtureButton } from '#/components/DevFixtureButton'
import {
  PdfDropzoneCard,
  type PdfDropzoneStatus,
} from '#/components/PdfDropzoneCard'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { validateFile } from '#/lib/upload/utils'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 10 * 60_000

interface PdfUploadProps {
  onComplete: (result: {
    jobId: string
    totalPages: number
    scannedWarning: boolean
    durationMs?: number
  }) => void
}

export function PdfUpload({ onComplete }: PdfUploadProps) {
  const [state, setState] = useState<UploadState>({ step: 'idle' })

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file)
    if (error) {
      setState({ step: 'error', file, message: error })
      return
    }
    setState({ step: 'selected', file })
  }, [])

  const uploadFile = useCallback(
    async (file: File) => {
      setState({ step: 'uploading', file, progress: 0 })

      try {
        const formData = new FormData()
        formData.append('file', file)

        setState({ step: 'uploading', file, progress: 30 })

        const { uploadThesis, processUpload, getJob } = await import(
          '#/services/pdf/upload'
        )
        const uploadResult = await uploadThesis({ data: formData })

        setState({ step: 'extracting', file, jobId: uploadResult.jobId })

        // Extraction now runs detached on the server; kick it off and
        // poll for status so the work survives this tab closing.
        await processUpload({ data: { jobId: uploadResult.jobId } })

        const startedAt = Date.now()
        let job = await getJob({ data: { jobId: uploadResult.jobId } })
        while (job.status !== 'done' && job.status !== 'failed') {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error(
              'Extraction is taking longer than expected. It keeps running in the background — check Riwayat shortly.',
            )
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          job = await getJob({ data: { jobId: uploadResult.jobId } })
        }

        if (job.status === 'failed') {
          throw new Error(job.error ?? 'Extraction failed')
        }

        const totalPages = job.totalPages ?? 0
        setState({
          step: 'done',
          file,
          jobId: job.id,
          totalPages,
          extractedPages: job.extractedPages,
          scannedWarning: job.scannedWarning,
        })

        onComplete({
          jobId: job.id,
          totalPages,
          scannedWarning: job.scannedWarning,
          durationMs:
            new Date(job.updatedAt).getTime() -
            new Date(job.createdAt).getTime(),
        })
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Upload failed. Check your connection and retry, or pick a different PDF.'
        setState({ step: 'error', file, message })
      }
    },
    [onComplete],
  )

  const handleUpload = useCallback(() => {
    if (state.step !== 'selected') return
    void uploadFile(state.file)
  }, [state, uploadFile])

  const reset = useCallback(() => {
    setState({ step: 'idle' })
  }, [])

  const dropzoneStatus: PdfDropzoneStatus =
    state.step === 'idle'
      ? { kind: 'idle' }
      : state.step === 'selected'
        ? { kind: 'selected', file: state.file }
        : state.step === 'uploading' || state.step === 'extracting'
          ? { kind: 'busy', file: state.file }
          : state.step === 'error'
            ? { kind: 'error', file: state.file, message: state.message }
            : { kind: 'busy', file: state.file }

  const showDropZone = state.step === 'idle' || state.step === 'error'

  return (
    <div className="flex flex-col gap-6">
      <PdfDropzoneCard
        status={dropzoneStatus}
        onFileSelected={handleFile}
        onReset={reset}
      />
      {showDropZone && <DevFixtureButton onPickFile={uploadFile} />}

      {state.step === 'uploading' && (
        <span className="inline-flex items-baseline gap-2 text-[0.9375rem] text-[var(--sea-ink-soft)]">
          <Loader2
            className="h-4 w-4 translate-y-px animate-spin text-[var(--lagoon-deep)]"
            strokeWidth={1.75}
          />
          Mengunggah skripsi…{' '}
          <span className="kicker tabular-nums text-[var(--sea-ink-soft)]/80">
            {state.progress}%
          </span>
        </span>
      )}

      {state.step === 'extracting' && (
        <span className="inline-flex items-baseline gap-2 text-[0.9375rem] text-[var(--sea-ink-soft)]">
          <Loader2
            className="h-4 w-4 translate-y-px animate-spin text-[var(--lagoon-deep)]"
            strokeWidth={1.75}
          />
          Mengekstrak teks dari PDF…
        </span>
      )}

      {state.step === 'done' && (
        <div className="flex flex-col gap-3">
          <aside className="grid grid-cols-[3.5rem_1fr] gap-x-5">
            <span
              aria-hidden
              className="marginalia-rule mt-1 h-[calc(100%-0.25rem)] w-px justify-self-end"
              data-severity="info"
            />
            <div>
              <p className="small-caps pageref text-xs text-[var(--lagoon-deep)]">
                Ekstraksi selesai
              </p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
                {state.extractedPages} halaman berhasil diekstrak.
              </p>
            </div>
          </aside>

          {state.scannedWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                PDF ini terlihat seperti hasil pindaian. Ekstraksi teks mungkin
                tidak lengkap; beberapa halaman menghasilkan sedikit teks.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        {state.step === 'selected' && (
          <Button type="button" onClick={handleUpload}>
            Mulai ekstraksi
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          </Button>
        )}
        {(state.step === 'done' || state.step === 'error') && (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Pilih berkas lain
          </Button>
        )}
      </div>
    </div>
  )
}
