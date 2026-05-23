import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FileText, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { Alert, AlertDescription } from '#/components/ui/alert'

type UploadState =
  | { step: 'idle' }
  | { step: 'selected'; file: File }
  | { step: 'uploading'; file: File; progress: number }
  | { step: 'extracting'; file: File; jobId: string }
  | {
      step: 'done'
      file: File
      jobId: string
      totalPages: number
      extractedPages: number
      scannedWarning: boolean
    }
  | { step: 'error'; file: File | null; message: string }

interface PdfUploadProps {
  onComplete: (result: {
    jobId: string
    totalPages: number
    scannedWarning: boolean
  }) => void
}

const MAX_FILE_SIZE = 50 * 1024 * 1024

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PdfUpload({ onComplete }: PdfUploadProps) {
  const [state, setState] = useState<UploadState>({ step: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (file.type !== 'application/pdf') return 'Only PDF files are accepted'
    if (file.size > MAX_FILE_SIZE) return 'File size exceeds 50MB limit'
    return null
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file)
      if (error) {
        setState({ step: 'error', file, message: error })
        return
      }
      setState({ step: 'selected', file })
    },
    [validateFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleUpload = useCallback(async () => {
    if (state.step !== 'selected') return
    const { file } = state

    setState({ step: 'uploading', file, progress: 0 })

    try {
      const formData = new FormData()
      formData.append('file', file)

      setState({ step: 'uploading', file, progress: 30 })

      const { uploadThesis } = await import('#/services/upload')
      const uploadResult = await uploadThesis({ data: formData })

      setState({ step: 'extracting', file, jobId: uploadResult.jobId })

      const { processUpload } = await import('#/services/upload')
      const extractResult = await processUpload({
        data: { jobId: uploadResult.jobId },
      })

      setState({
        step: 'done',
        file,
        jobId: extractResult.jobId,
        totalPages: extractResult.totalPages,
        extractedPages: extractResult.extractedPages,
        scannedWarning: extractResult.scannedWarning,
      })

      onComplete({
        jobId: extractResult.jobId,
        totalPages: extractResult.totalPages,
        scannedWarning: extractResult.scannedWarning,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setState({ step: 'error', file, message })
    }
  }, [state, onComplete])

  const reset = useCallback(() => {
    setState({ step: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const file =
    state.step !== 'idle' && state.step !== 'error' ? state.file : null
  const errorFile = state.step === 'error' ? state.file : null

  return (
    <div className="flex flex-col gap-4">
      {state.step === 'idle' || state.step === 'error' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
            dragOver
              ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/8'
              : 'border-[var(--sea-ink)]/15 hover:border-[var(--lagoon)]/50 hover:bg-[var(--lagoon)]/4'
          }`}
        >
          <Upload
            className="h-10 w-10 text-[var(--sea-ink-soft)]"
            strokeWidth={1.5}
          />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--sea-ink)]">
              Drop your thesis PDF here, or click to browse
            </p>
            <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
              PDF only, max 50MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--sea-ink)]/10 bg-[var(--lagoon)]/4 px-4 py-3">
          <FileText
            className="h-8 w-8 shrink-0 text-[var(--lagoon)]"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--sea-ink)]">
              {file?.name ?? errorFile?.name ?? 'Unknown file'}
            </p>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              {file ? formatFileSize(file.size) : ''}
            </p>
          </div>
          {state.step === 'selected' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                reset()
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {state.step === 'error' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.step === 'uploading' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[var(--sea-ink-soft)]">
            <span>Uploading...</span>
            <span>{state.progress}%</span>
          </div>
          <Progress value={state.progress} />
        </div>
      )}

      {state.step === 'extracting' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[var(--sea-ink-soft)]">
            <span>Extracting text from PDF...</span>
          </div>
          <Progress value={100} className="animate-pulse" />
        </div>
      )}

      {state.step === 'done' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Extracted {state.extractedPages} pages successfully
            </p>
          </div>

          {state.scannedWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This PDF appears to be scanned. Text extraction may be
                incomplete — some pages had very little detectable text.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {state.step === 'selected' && (
        <Button onClick={handleUpload} className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          Upload & Extract Text
        </Button>
      )}

      {(state.step === 'done' || state.step === 'error') && (
        <Button variant="outline" onClick={reset} className="w-full">
          Upload Another File
        </Button>
      )}
    </div>
  )
}
