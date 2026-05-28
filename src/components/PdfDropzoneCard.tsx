import { useCallback, useId, useRef } from 'react'
import { FileText, X } from 'lucide-react'
import { formatFileSize } from '#/lib/upload/utils'
import { useAnnounce } from '#/stores/announcer'

export type PdfDropzoneStatus =
  | { kind: 'idle' }
  | { kind: 'selected'; file: File }
  | { kind: 'busy'; file: File }
  | { kind: 'error'; file: File | null; message: string }

export interface PdfDropzoneCopy {
  dropHeadline: string
  dropClickAffordance: string
  maxSizeLabel: string
  selectedLabel: string
  replaceLabel: string
  errorTitle: string
  inputAriaLabel: string
  dropAriaLabel: string
  unknownFileLabel: string
}

const DEFAULT_COPY: PdfDropzoneCopy = {
  dropHeadline: 'Lepas PDF skripsi di sini',
  dropClickAffordance: 'klik untuk memilih dari komputer',
  maxSizeLabel: 'PDF · maks 50 MB',
  selectedLabel: 'Dipilih',
  replaceLabel: 'ganti',
  errorTitle: 'Tidak dapat diunggah',
  inputAriaLabel: 'Unggah PDF',
  dropAriaLabel: 'Unggah PDF skripsi',
  unknownFileLabel: 'Berkas tidak diketahui',
}

interface PdfDropzoneCardProps {
  status: PdfDropzoneStatus
  onFileSelected: (file: File) => void
  onReset?: () => void
  acceptedMimeType?: string
  inputId?: string
  copy?: Partial<PdfDropzoneCopy>
  className?: string
}

export function PdfDropzoneCard({
  status,
  onFileSelected,
  onReset,
  acceptedMimeType = 'application/pdf',
  inputId,
  copy,
  className,
}: PdfDropzoneCardProps) {
  const generatedId = useId()
  const id = inputId ?? `pdf-dropzone-${generatedId}`
  const inputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef<HTMLLabelElement>(null)
  const announce = useAnnounce()

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragOverRef.current?.removeAttribute('data-dragover')
      const file = e.dataTransfer.files[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const el = dragOverRef.current
      if (el && !el.hasAttribute('data-dragover')) {
        // First dragOver in this hover — announce once. Repeated dragOver
        // events while the cursor is still inside the zone are no-ops
        // (we already set the attribute).
        el.setAttribute('data-dragover', 'true')
        announce('Lepas PDF di sini untuk mengunggah.')
      }
    },
    [announce],
  )

  const handleDragLeave = useCallback(() => {
    dragOverRef.current?.removeAttribute('data-dragover')
  }, [])

  const handleResetClick = useCallback(() => {
    if (inputRef.current) inputRef.current.value = ''
    onReset?.()
  }, [onReset])

  const showDropZone = status.kind === 'idle' || status.kind === 'error'
  const fileInRow =
    status.kind === 'selected' || status.kind === 'busy'
      ? status.file
      : status.kind === 'error'
        ? status.file
        : null

  const c = { ...DEFAULT_COPY, ...copy }

  return (
    <div className={className}>
      {/*
        The dropzone is a <label> rather than a <button>: <input type="file">
        is interactive content and the HTML spec forbids it as a descendant
        of <button>. With <label htmlFor>, the click delegation to the
        input is native and the markup is spec-compliant. The input uses
        sr-only (not display:none) so keyboard users can still tab to it.
      */}
      {showDropZone ? (
        <label
          ref={dragOverRef}
          htmlFor={id}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={c.dropAriaLabel}
          className="group relative grid w-full cursor-pointer grid-cols-[3.5rem_1fr] items-start gap-x-5 rounded-2xl border-2 border-dashed border-[var(--line-strong)] bg-white px-6 py-12 text-left transition-colors hover:border-[var(--accent-coral)] data-[dragover=true]:border-[var(--accent-coral)] data-[dragover=true]:bg-[var(--bg-butter)]/40"
        >
          <span
            aria-hidden
            className="marginalia-rule pointer-events-none absolute left-0 top-4 bottom-4 w-px opacity-40 transition-opacity group-data-[dragover=true]:opacity-100"
            data-severity="warning"
          />
          <span className="kicker tabular-nums text-foreground">№01</span>
          <div>
            <p className="display-title text-2xl font-medium leading-snug text-foreground sm:text-3xl">
              {c.dropHeadline}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
              atau{' '}
              <span className="border-b border-[var(--sea-ink)]/60 text-foreground transition-colors group-hover:border-[var(--lagoon-deep)]">
                {c.dropClickAffordance}
              </span>
              .
            </p>
            <p className="kicker mt-4 text-[var(--sea-ink-soft)]/80">
              {c.maxSizeLabel}
            </p>
          </div>
          <input
            id={id}
            ref={inputRef}
            type="file"
            accept={acceptedMimeType}
            className="sr-only"
            onChange={handleInputChange}
            aria-label={c.inputAriaLabel}
          />
        </label>
      ) : (
        <div className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-x-5 border-t border-b border-[var(--line)] py-8">
          <span className="kicker tabular-nums text-[var(--lagoon-deep)]">
            №01
          </span>
          <div className="min-w-0">
            <p className="flex items-baseline gap-2 text-[0.75rem]">
              <FileText
                className="h-3.5 w-3.5 translate-y-px text-[var(--sea-ink-soft)]"
                strokeWidth={1.75}
              />
              <span className="kicker text-[var(--sea-ink-soft)]">
                {c.selectedLabel}
              </span>
            </p>
            <p className="mt-1 display-title text-xl font-medium leading-snug text-foreground sm:text-2xl">
              {fileInRow?.name ?? c.unknownFileLabel}
            </p>
            <p className="kicker mt-2 text-[var(--sea-ink-soft)]/80">
              {fileInRow ? formatFileSize(fileInRow.size) : ''}
            </p>
          </div>
          {status.kind === 'selected' && onReset && (
            <button
              type="button"
              onClick={handleResetClick}
              aria-label="Ganti berkas"
              className="kicker mt-1 inline-flex items-center gap-1 text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--destructive)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              {c.replaceLabel}
            </button>
          )}
        </div>
      )}

      {status.kind === 'error' && (
        <aside className="mt-6 grid grid-cols-[3.5rem_1fr] gap-x-5">
          <span
            aria-hidden
            className="marginalia-rule mt-1 h-[calc(100%-0.25rem)] w-px justify-self-end"
            data-severity="error"
          />
          <div>
            <p className="small-caps pageref text-xs text-[var(--destructive)]">
              {c.errorTitle}
            </p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
              {status.message}
            </p>
          </div>
        </aside>
      )}
    </div>
  )
}
