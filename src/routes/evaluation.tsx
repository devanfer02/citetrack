import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FileText, Loader2, Upload, X } from 'lucide-react'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { formatFileSize, validateFile } from '#/lib/upload/utils'
import { getErrorMessage } from '#/lib/utils'

export const Route = createFileRoute('/evaluation')({
  component: EvaluationPage,
})

type UploadState =
  | { step: 'idle' }
  | { step: 'selected'; file: File }
  | { step: 'uploading'; file: File }
  | { step: 'error'; file: File | null; message: string }

function EvaluationPage() {
  const childMatches = useChildMatches()
  if (childMatches.length > 0) return <Outlet />
  return <EvaluationUpload />
}

function EvaluationUpload() {
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>({ step: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const [enableFilkom, setEnableFilkom] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file)
    if (error) {
      setState({ step: 'error', file, message: error })
      return
    }
    setState({ step: 'selected', file })
  }, [])

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
      formData.append('enableFilkom', enableFilkom ? 'true' : 'false')

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
        message: getErrorMessage(
          err,
          "Upload failed. Check your connection and retry, or pick a different PDF.",
        ),
      })
    }
  }, [state, navigate, enableFilkom])

  const reset = useCallback(() => {
    setState({ step: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const currentFile =
    state.step === 'selected' || state.step === 'uploading'
      ? state.file
      : state.step === 'error'
        ? state.file
        : null

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-8 pt-8">
      <h1 className="display-title mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Evaluation
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Upload your skripsi PDF and we&apos;ll check it against KBBI (spelling),
        EYD (Indonesian orthography), and the FILKOM template structural
        rules. Results appear as a categorized report.
      </p>

      <div className="flex flex-col gap-4">
        {state.step === 'idle' || state.step === 'error' ? (
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
              dragOver
                ? 'border-primary bg-primary/8'
                : 'border-border/15 hover:border-primary/50 hover:bg-primary/4'
            }`}
          >
            <Upload
              className="h-10 w-10 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Drop your thesis PDF here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
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
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border/15 bg-primary/4 px-4 py-3">
            <FileText
              className="h-8 w-8 shrink-0 text-primary"
              strokeWidth={1.5}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {currentFile?.name ?? 'Unknown file'}
              </p>
              <p className="text-xs text-muted-foreground">
                {currentFile ? formatFileSize(currentFile.size) : ''}
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

        {(state.step === 'selected' || state.step === 'uploading') && (
          <div className="flex items-start justify-between gap-4 rounded-xl border-2 border-dashed border-border/15 bg-primary/4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="enable-filkom"
                className="text-sm font-medium text-foreground"
              >
                Periksa struktur template FILKOM
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Matikan jika dokumenmu bukan skripsi FILKOM atau tidak mengikuti
                template v3.0.
              </p>
            </div>
            <Switch
              id="enable-filkom"
              checked={enableFilkom}
              onCheckedChange={setEnableFilkom}
              disabled={state.step === 'uploading'}
            />
          </div>
        )}

        {state.step === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {state.step === 'selected' && (
          <Button onClick={handleEvaluate} className="w-full">
            <Upload className="mr-2 h-4 w-4" />
            Evaluate Thesis
          </Button>
        )}

        {state.step === 'uploading' && (
          <Button disabled className="w-full">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading…
          </Button>
        )}

        {state.step === 'error' && (
          <Button variant="outline" onClick={reset} className="w-full">
            Upload Another File
          </Button>
        )}
      </div>
    </main>
  )
}
