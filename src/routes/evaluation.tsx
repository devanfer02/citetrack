import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FileText, Loader2, Upload, X } from 'lucide-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { getErrorMessage } from '#/lib/utils'

export const Route = createFileRoute('/evaluation')({
  component: EvaluationPage,
})

type UploadState =
  | { step: 'idle' }
  | { step: 'selected'; file: File }
  | { step: 'uploading'; file: File }
  | { step: 'error'; file: File | null; message: string }

const MAX_FILE_SIZE = 50 * 1024 * 1024

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function EvaluationPage() {
  const navigate = useNavigate()
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

  const handleEvaluate = useCallback(async () => {
    if (state.step !== 'selected') return
    const { file } = state
    setState({ step: 'uploading', file })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const { uploadEvaluationThesis, processEvaluationUpload } = await import(
        '#/services/evaluation/upload'
      )
      const { evalJobId } = await uploadEvaluationThesis({ data: formData })

      void processEvaluationUpload({ data: { evalJobId } }).catch(() => {})

      await navigate({ to: '/evaluation/$evalId', params: { evalId: evalJobId } })
    } catch (err) {
      setState({
        step: 'error',
        file,
        message: getErrorMessage(err, 'Upload failed. Please try again.'),
      })
    }
  }, [state, navigate])

  const reset = useCallback(() => {
    setState({ step: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-8">
      <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Evaluation
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Upload your skripsi PDF and we&apos;ll check it against KBBI (spelling),
        EYD (Indonesian orthography), and the FILKOM template structural
        rules. Results appear as a categorized report.
      </p>

      {state.step === 'idle' && (
        <label
          htmlFor="evaluation-file"
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-[var(--line)] bg-[var(--chip-bg)] hover:border-primary/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Drop your thesis PDF here, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF only, up to 50 MB
            </p>
          </div>
          <input
            id="evaluation-file"
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </label>
      )}

      {(state.step === 'selected' || state.step === 'uploading') && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{state.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(state.file.size)}
              </p>
            </div>
            {state.step === 'selected' && (
              <Button variant="ghost" size="icon" onClick={reset}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            onClick={handleEvaluate}
            disabled={state.step === 'uploading'}
          >
            {state.step === 'uploading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              'Evaluate Thesis'
            )}
          </Button>
        </div>
      )}

      {state.step === 'error' && (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={reset}>
            Try another file
          </Button>
        </div>
      )}
    </main>
  )
}
