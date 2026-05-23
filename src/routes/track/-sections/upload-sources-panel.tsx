import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileText, Upload, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { getErrorMessage } from '#/lib/utils'
import { sourceUploadsQuery } from '#/lib/pipeline/queries'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const UNASSIGNED = '__unassigned__'

interface ReferenceOption {
  id: number
  author: string
  year: string
  title: string
}

const refLabel = (ref: ReferenceOption): string =>
  `${ref.author} (${ref.year}) — ${ref.title.slice(0, 80)}${ref.title.length > 80 ? '…' : ''}`

interface UploadSourcesPanelProps {
  jobId: string
  onBack: () => void
  onReset: () => void
  onMatchPassages: () => void
}

export function UploadSourcesPanel({
  jobId,
  onBack,
  onReset,
  onMatchPassages,
}: UploadSourcesPanelProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data } = useQuery(sourceUploadsQuery(jobId))
  const uploads = data?.uploads ?? []
  const references = data?.references ?? []

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData()
      formData.append('jobId', jobId)
      for (const f of files) formData.append('files', f)
      const { uploadSourcePdfs } = await import(
        '#/services/pdf/source-uploads'
      )
      return uploadSourcePdfs({ data: formData })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pipeline', jobId, 'source-uploads'],
      })
    },
    onError: (err) => {
      setUploadError(getErrorMessage(err, 'Upload failed'))
    },
  })

  const pairMutation = useMutation({
    mutationFn: async (input: {
      sourcePdfId: number
      referenceId: number | null
    }) => {
      const { pairSourcePdf } = await import('#/services/pdf/source-uploads')
      return pairSourcePdf({ data: input })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pipeline', jobId, 'source-uploads'],
      })
    },
  })

  const handleFiles = useCallback(
    (files: File[]) => {
      setUploadError(null)
      const invalid = files.find(
        (f) => f.type !== 'application/pdf' || f.size > MAX_FILE_SIZE,
      )
      if (invalid) {
        setUploadError(
          `"${invalid.name}" must be a PDF under 50 MB`,
        )
        return
      }
      if (files.length === 0) return
      uploadMutation.mutate(files)
    },
    [uploadMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = [...e.dataTransfer.files]
      handleFiles(files)
    },
    [handleFiles],
  )

  const handlePair = useCallback(
    (sourcePdfId: number, value: string) => {
      const referenceId = value === UNASSIGNED ? null : Number(value)
      pairMutation.mutate({ sourcePdfId, referenceId })
    },
    [pairMutation],
  )

  const pairedCount = uploads.filter((u) => u.referenceId !== null).length
  const canContinue = pairedCount > 0 && !uploadMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Upload the PDFs of the papers you cited. Filenames can be anything
          (e.g. <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">a.pdf</code>);
          we&apos;ll auto-pair each upload to the reference it most closely
          matches. Correct any mis-pairs with the dropdown.
        </p>
      </div>

      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          dragOver
            ? 'border-primary bg-primary/8'
            : 'border-border/15 hover:border-primary/50 hover:bg-primary/4'
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {uploadMutation.isPending
              ? 'Uploading and extracting text…'
              : 'Drop your reference PDFs here, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDFs only · up to 50 MB each · you can upload multiple at once
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            handleFiles(files)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </button>

      {uploadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {uploads.length} upload{uploads.length === 1 ? '' : 's'} ·{' '}
              {pairedCount} paired
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {uploads.map((u) => (
              <li
                key={u.sourcePdfId}
                className="flex items-center gap-3 rounded-lg border border-border/10 bg-[var(--chip-bg)]/40 px-3 py-2"
              >
                <FileText
                  className="h-5 w-5 shrink-0 text-primary"
                  strokeWidth={1.5}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.filename ?? `upload-${u.sourcePdfId}.pdf`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.status === 'done'
                      ? `${u.totalPages ?? '?'} pages`
                      : u.status === 'failed'
                        ? (u.error ?? 'failed')
                        : 'processing…'}
                  </p>
                </div>
                <Select
                  value={
                    u.referenceId === null ? UNASSIGNED : String(u.referenceId)
                  }
                  onValueChange={(v) => handlePair(u.sourcePdfId, v)}
                  disabled={u.status !== 'done'}
                >
                  <SelectTrigger
                    className="w-[22rem] max-w-[50vw]"
                    aria-label="Pair with reference"
                  >
                    <SelectValue placeholder="Pair with reference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {references.map((ref) => (
                      <SelectItem key={ref.id} value={String(ref.id)}>
                        {refLabel(ref)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {u.referenceId !== null && u.status === 'done' && (
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-[var(--palm)]"
                    strokeWidth={2}
                  />
                )}
                {u.status === 'failed' && (
                  <X
                    className="h-5 w-5 shrink-0 text-destructive"
                    strokeWidth={2}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            ← Back to Matching
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Analyze another thesis
          </Button>
        </div>
        <Button onClick={onMatchPassages} disabled={!canContinue}>
          Find Passages →
        </Button>
      </div>
    </div>
  )
}
