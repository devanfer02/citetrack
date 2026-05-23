import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, FileText, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { formatFileSize, validateFile } from '#/lib/upload/utils'

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
  const [dragOver, setDragOver] = useState(false)
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

  const handleUpload = useCallback(async () => {
    if (state.step !== 'selected') return
    const { file } = state

    setState({ step: 'uploading', file, progress: 0 })

    try {
      const formData = new FormData()
      formData.append('file', file)

      setState({ step: 'uploading', file, progress: 30 })

      const { uploadThesis } = await import('#/services/pdf/upload')
      const uploadResult = await uploadThesis({ data: formData })

      setState({ step: 'extracting', file, jobId: uploadResult.jobId })

      const { processUpload } = await import('#/services/pdf/upload')
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
        durationMs: extractResult.durationMs,
      })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Upload failed. Check your connection and retry, or pick a different PDF."
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
        <div className="flex items-center gap-3 rounded-xl border border-border/10 bg-primary/4 px-4 py-3">
          <FileText
            className="h-8 w-8 shrink-0 text-primary"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {file?.name ?? errorFile?.name ?? 'Unknown file'}
            </p>
            <p className="text-xs text-muted-foreground">
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
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Uploading...</span>
            <span>{state.progress}%</span>
          </div>
          <Progress value={state.progress} />
        </div>
      )}

      {state.step === 'extracting' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Extracting text from PDF...</span>
          </div>
          <Progress value={100} className="animate-pulse" />
        </div>
      )}

      {state.step === 'done' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-accent/20 bg-accent/8 px-4 py-3">
            <p className="text-sm font-medium text-accent-foreground">
              Extracted {state.extractedPages} pages successfully
            </p>
          </div>

          {state.scannedWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This PDF appears to be scanned. Text extraction may be
                incomplete; some pages had very little detectable text.
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
