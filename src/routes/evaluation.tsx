import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { ArrowUpRight, FileText, Loader2, X } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Lightbulb, Squiggle } from '#/components/doodles'
import { Button } from '#/components/ui/button'
import { formatFileSize, validateFile } from '#/lib/upload/utils'
import { getErrorMessage } from '#/lib/utils'

export const Route = createFileRoute('/evaluation')({
  component: EvaluationPage,
  head: () => ({
    meta: [
      { title: 'Evaluation · CiteTrack' },
      {
        name: 'description',
        content:
          'Periksa ejaan dan EYD seluruh draf skripsi terhadap KBBI dan aturan ejaan terbaru, halaman demi halaman.',
      },
      { property: 'og:title', content: 'Evaluation · CiteTrack' },
      {
        property: 'og:description',
        content:
          'Periksa ejaan dan EYD seluruh draf skripsi terhadap KBBI dan aturan ejaan terbaru, halaman demi halaman.',
      },
    ],
  }),
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
          'Unggah gagal. Periksa koneksi dan coba ulang, atau pilih PDF lain.',
        ),
      })
    }
  }, [state, navigate])

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

  const showDropZone = state.step === 'idle' || state.step === 'error'

  return (
    <main className="flex-1">
      <Section tone="butter" grid innerClassName="relative pb-12 pt-16">
        <Squiggle
          tone="coral"
          size={56}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <Lightbulb
          tone="yellow"
          size={42}
          className="absolute left-[4%] bottom-6 hidden md:block"
        />
        <div className="mx-auto max-w-3xl">
          <span className="kicker text-[var(--accent-coral-deep)]">
            Evaluation
          </span>
          <h1 className="display-title mt-3 text-[clamp(2.25rem,4vw,3rem)] font-extrabold leading-[1.04] tracking-tight text-[var(--ink)]">
            Periksa{' '}
            <Marker tone="yellow">ejaan</Marker>{' '}
            dan EYD seluruh draf.
          </h1>
          <p className="mt-5 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
            Unggah PDF skripsi. CiteTrack akan memeriksanya terhadap{' '}
            <AccentInk>KBBI</AccentInk> (kosakata) dan{' '}
            <AccentInk tone="indigo">EYD</AccentInk> (ejaan), lalu menampilkan
            temuan per kategori dengan halaman dan saran perbaikannya.
          </p>
        </div>
      </Section>

      <section
        aria-label="Unggah skripsi"
        className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10 sm:px-8"
      >
        {showDropZone ? (
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`group relative grid w-full grid-cols-[3.5rem_1fr] items-start gap-x-5 rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-left transition-colors ${
              dragOver
                ? 'border-[var(--accent-coral)] bg-[var(--bg-butter)]/40'
                : 'border-[var(--line-strong)] hover:border-[var(--accent-coral)]'
            }`}
            aria-label="Unggah PDF skripsi"
          >
            <span
              aria-hidden
              className={`marginalia-rule pointer-events-none absolute left-0 top-4 bottom-4 w-px transition-opacity ${
                dragOver ? 'opacity-100' : 'opacity-40'
              }`}
              data-severity="warning"
            />
            <span className="kicker tabular-nums text-foreground">№01</span>
            <div>
              <p className="display-title text-2xl font-medium leading-snug text-foreground sm:text-3xl">
                Lepas PDF skripsi di sini
              </p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                atau{' '}
                <span className="border-b border-[var(--sea-ink)]/60 text-foreground transition-colors group-hover:border-[var(--lagoon-deep)]">
                  klik untuk memilih dari komputer
                </span>
                .
              </p>
              <p className="kicker mt-4 text-[var(--sea-ink-soft)]/80">
                PDF · maks 50 MB
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
                  Dipilih
                </span>
              </p>
              <p className="mt-1 display-title text-xl font-medium leading-snug text-foreground sm:text-2xl">
                {currentFile?.name ?? 'Berkas tidak diketahui'}
              </p>
              <p className="kicker mt-2 text-[var(--sea-ink-soft)]/80">
                {currentFile ? formatFileSize(currentFile.size) : ''}
              </p>
            </div>
            {state.step === 'selected' && (
              <button
                type="button"
                onClick={reset}
                aria-label="Ganti berkas"
                className="kicker mt-1 inline-flex items-center gap-1 text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--destructive)]"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                ganti
              </button>
            )}
          </div>
        )}

        {state.step === 'error' && (
          <aside className="mt-6 grid grid-cols-[3.5rem_1fr] gap-x-5">
            <span
              aria-hidden
              className="marginalia-rule mt-1 h-[calc(100%-0.25rem)] w-px justify-self-end"
              data-severity="error"
            />
            <div>
              <p className="small-caps pageref text-xs text-[var(--destructive)]">
                Tidak dapat diunggah
              </p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
                {state.message}
              </p>
            </div>
          </aside>
        )}

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          {state.step === 'selected' && (
            <Button type="button" onClick={handleEvaluate}>
              Mulai pemeriksaan
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
            </Button>
          )}
          {state.step === 'uploading' && (
            <span className="inline-flex items-baseline gap-2 pb-1 text-[0.9375rem] text-[var(--sea-ink-soft)]">
              <Loader2
                className="h-4 w-4 translate-y-px animate-spin text-[var(--lagoon-deep)]"
                strokeWidth={1.75}
              />
              Mengunggah skripsi…
            </span>
          )}
          {state.step === 'error' && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Pilih berkas lain
            </Button>
          )}
          {(state.step === 'idle' || state.step === 'error') && (
            <p className="kicker text-[var(--sea-ink-soft)]/70">
              Naskah disimpan lokal · hasil tampil di halaman berikut
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
