import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Lightbulb } from '#/components/doodles'
import { getErrorMessage } from '#/lib/utils'
import { sourceUploadsQuery } from '#/lib/pipeline/queries'
import {
  getSourceProviderStatus,
  type SourceProviderStatus,
} from '#/services/pdf/providers'

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

const AUTO_DETECT_TIMEOUT_MS = 20_000

function ProcessingDots() {
  return (
    <span className="dots-loop">
      Processing<span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  )
}

const PROVENANCE_LABEL: Record<FetchSource, string> = {
  doi: 'via DOI',
  crossref: 'via CrossRef',
  unpaywall: 'via Unpaywall',
  'semantic-scholar': 'via Semantic Scholar',
  openalex: 'via OpenAlex',
  europepmc: 'via Europe PMC',
  pubmed: 'via PubMed',
  arxiv: 'via arXiv',
  core: 'via CORE',
  manual: 'uploaded by you',
}

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
  const autoFetchFired = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [autoDetectTimedOut, setAutoDetectTimedOut] = useState(false)
  const [autoFetchAcknowledged, setAutoFetchAcknowledged] = useState(false)

  const providersQuery = useQuery({
    queryKey: ['source-providers'],
    queryFn: () => getSourceProviderStatus(),
    staleTime: 5 * 60_000,
  })

  const uploadsQuery = useQuery({
    ...sourceUploadsQuery(jobId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 1500
      const active = data.uploads.some(
        (u) =>
          u.status === 'pending' ||
          u.status === 'downloading' ||
          u.status === 'extracting' ||
          u.status === 'found',
      )
      return active ? 1500 : false
    },
  })
  const uploads = uploadsQuery.data?.uploads ?? []
  const references = uploadsQuery.data?.references ?? []

  const autoFetchMutation = useMutation({
    mutationFn: async () => {
      const { autoFetchSources } = await import('#/services/pdf/auto-fetch')
      return autoFetchSources({ data: { jobId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['pipeline', jobId, 'source-uploads'],
      })
    },
  })

  useEffect(() => {
    if (autoFetchFired.current) return
    if (!uploadsQuery.isSuccess) return
    if (uploads.length > 0) {
      // Sources already exist for this job — no need to confirm or re-fetch.
      autoFetchFired.current = true
      return
    }
    // Wait for the user to acknowledge the provider notice before
    // calling out to the external APIs, so they know which sources
    // were used and how to enable more.
    if (!autoFetchAcknowledged) return
    autoFetchFired.current = true
    autoFetchMutation.mutate()
  }, [
    uploadsQuery.isSuccess,
    uploads.length,
    autoFetchAcknowledged,
    autoFetchMutation,
  ])

  useEffect(() => {
    if (!autoFetchMutation.isPending) return
    const timer = setTimeout(
      () => setAutoDetectTimedOut(true),
      AUTO_DETECT_TIMEOUT_MS,
    )
    return () => clearTimeout(timer)
  }, [autoFetchMutation.isPending])

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
        setUploadError(`"${invalid.name}" must be a PDF under 50 MB`)
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
  const autoFetching = autoFetchMutation.isPending
  const anyProcessing = uploads.some(
    (u) =>
      u.status === 'pending' ||
      u.status === 'downloading' ||
      u.status === 'extracting' ||
      u.status === 'found',
  )
  const detectionDone =
    autoFetchFired.current &&
    !autoFetching &&
    !anyProcessing &&
    uploadsQuery.isSuccess
  const canContinue =
    pairedCount > 0 &&
    !uploadMutation.isPending &&
    (!anyProcessing || autoDetectTimedOut)

  const dropCopy = uploadMutation.isPending
    ? 'Uploading and extracting text…'
    : detectionDone
      ? 'Upload any PDFs we couldn’t auto-fetch'
      : autoDetectTimedOut && (autoFetching || anyProcessing)
        ? 'Still searching. Drop more PDFs here, or continue with what we found.'
        : autoFetching || anyProcessing
          ? 'Auto-detecting reference PDFs from public APIs…'
          : 'Drop your reference PDFs here, or click to browse'

  const showProviderNotice =
    uploadsQuery.isSuccess &&
    uploads.length === 0 &&
    !autoFetchAcknowledged &&
    !autoFetching

  return (
    <div className="flex flex-col gap-6">
      {showProviderNotice && providersQuery.data && (
        <ProviderNotice
          providers={providersQuery.data}
          onStart={() => setAutoFetchAcknowledged(true)}
        />
      )}

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
        {autoFetching || anyProcessing ? (
          <Loader2
            className="h-8 w-8 animate-spin text-muted-foreground"
            strokeWidth={1.5}
          />
        ) : (
          <Upload
            className="h-8 w-8 text-muted-foreground"
            strokeWidth={1.5}
          />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{dropCopy}</p>
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
              {uploads.length} source{uploads.length === 1 ? '' : 's'} ·{' '}
              {pairedCount} paired
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {uploads.map((u) => {
              const provenance = u.fetchSource
                ? PROVENANCE_LABEL[u.fetchSource]
                : null
              return (
                <li
                  key={u.sourcePdfId}
                  className="flex items-center gap-3 rounded-lg border border-border/10 bg-[var(--chip-bg)]/40 px-3 py-2"
                >
                  <FileText
                    className="h-5 w-5 shrink-0 text-primary"
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {u.filename ?? `source-${u.sourcePdfId}.pdf`}
                      </p>
                      {provenance && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {provenance}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {u.status === 'done' ? (
                        `${u.totalPages ?? '?'} pages`
                      ) : u.status === 'failed' ? (
                        (u.error ?? 'failed')
                      ) : (
                        <ProcessingDots />
                      )}
                    </p>
                  </div>
                  <Select
                    value={
                      u.referenceId === null
                        ? UNASSIGNED
                        : String(u.referenceId)
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
              )
            })}
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

interface ProviderNoticeProps {
  providers: SourceProviderStatus[]
  onStart: () => void
}

function ProviderNotice({ providers, onStart }: ProviderNoticeProps) {
  const active = providers.filter((p) => p.enabled)
  const gated = providers.filter((p) => !p.enabled)
  return (
    <aside className="soft-card relative flex flex-col gap-4 p-6" data-tone="sky">
      <Lightbulb
        tone="yellow"
        size={36}
        className="absolute right-5 top-5 opacity-80"
      />
      <div>
        <span className="kicker text-[var(--accent-indigo-deep)]">
          Sebelum mulai
        </span>
        <h3 className="display-title mt-1 text-xl font-extrabold leading-snug text-[var(--ink)]">
          Sumber PDF yang akan ditelusuri
        </h3>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--ink-soft)]">
          CiteTrack akan menelusuri provider open-access di bawah untuk
          mengambil PDF tiap referensi. Untuk yang belum aktif, tambahkan
          nilai env var lalu restart server.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="kicker mb-2 text-[var(--ink-soft)]">
            Aktif sekarang
          </p>
          <ul className="flex flex-col gap-1.5 text-[0.875rem]">
            {active.map((p) => (
              <li
                key={p.name}
                className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-[var(--ink)]"
              >
                <span
                  className="severity-dot translate-y-[1px]"
                  data-severity="info"
                />
                <span className="leading-snug">
                  <span className="font-medium whitespace-nowrap">{p.name}</span>
                  {p.note && (
                    <span className="text-[var(--ink-soft)]"> — {p.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="kicker mb-2 text-[var(--ink-soft)]">
            Belum aktif (butuh env var)
          </p>
          {gated.length === 0 ? (
            <p className="text-[0.875rem] italic text-[var(--ink-soft)]">
              Semua provider sudah aktif.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[0.875rem]">
              {gated.map((p) => (
                <li
                  key={p.name}
                  className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-[var(--ink)]"
                >
                  <span
                    className="severity-dot translate-y-[1px]"
                    data-severity="warning"
                  />
                  <span className="leading-snug">
                    <span className="font-medium whitespace-nowrap">{p.name}</span>
                    {p.envVar && (
                      <>
                        {' '}
                        <code className="rounded bg-white/70 px-1.5 py-0.5 text-[0.6875rem] text-[var(--ink-soft)]">
                          {p.envVar}
                        </code>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button onClick={onStart}>Mulai pencarian</Button>
        <span className="kicker text-[var(--ink-soft)]">
          atau unggah PDF sumber secara manual di bawah
        </span>
      </div>
    </aside>
  )
}
