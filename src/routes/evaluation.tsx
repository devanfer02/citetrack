import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { AdminSettingsPanel } from '#/components/settings/admin-settings-panel'
import { Section } from '#/components/Section'
import { DevFixtureButton } from '#/components/DevFixtureButton'
import {
  PdfDropzoneCard,
  type PdfDropzoneStatus,
} from '#/components/PdfDropzoneCard'
import { PublicModeNotice } from '#/components/PublicModeNotice'
import { HeroEyebrow } from '#/components/HeroEyebrow'
import { TierFlowExplainer } from '#/components/TierFlowExplainer'
import { Lightbulb, Squiggle } from '#/components/doodles'
import { Button } from '#/components/ui/button'
import { isLocalEnv } from '#/env'
import { validateFile } from '#/lib/upload/utils'
import { getErrorMessage } from '#/lib/utils'
import { getEvaluationTierStats } from '#/services/evaluation/tier-stats'

const tierStatsQuery = queryOptions({
  queryKey: ['evaluation-tier-stats'] as const,
  queryFn: () => getEvaluationTierStats(),
  staleTime: 60_000,
})

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
  const { data: tierStats } = useQuery(tierStatsQuery)

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
      const validationError = validateFile(file)
      if (validationError) {
        setState({ step: 'error', file, message: validationError })
        return
      }
      setState({ step: 'uploading', file })

      try {
        const formData = new FormData()
        formData.append('file', file)

        const { uploadEvaluationThesis, processEvaluationUpload } =
          await import('#/services/evaluation/upload')
        const { evalJobId } = await uploadEvaluationThesis({ data: formData })

        void processEvaluationUpload({ data: { evalJobId } }).catch(() => {})

        await navigate({
          to: '/evaluation/$evalId',
          params: { evalId: evalJobId },
        })
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
    },
    [navigate],
  )

  const handleEvaluate = useCallback(() => {
    if (state.step !== 'selected') return
    void uploadFile(state.file)
  }, [state, uploadFile])

  const reset = useCallback(() => {
    setState({ step: 'idle' })
  }, [])

  const showDropZone = state.step === 'idle' || state.step === 'error'

  const dropzoneStatus: PdfDropzoneStatus =
    state.step === 'idle'
      ? { kind: 'idle' }
      : state.step === 'selected'
        ? { kind: 'selected', file: state.file }
        : state.step === 'uploading'
          ? { kind: 'busy', file: state.file }
          : { kind: 'error', file: state.file, message: state.message }

  return (
    <main id="main-content" className="flex-1">
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
          <HeroEyebrow
            label="Pemeriksaan"
            howItWorksHref="#cara-kerja"
            settingsHref={isLocalEnv ? '#setelan' : null}
          />
          <h1 className="display-title mt-4 text-[clamp(2.25rem,4vw,3rem)] font-extrabold leading-[1.04] tracking-tight text-[var(--ink)]">
            Periksa{' '}
            <Marker tone="yellow">ejaan</Marker>{' '}
            dan EYD seluruh draf.
          </h1>
          <p className="mt-5 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
            Unggah PDF skripsi. Tiap kata dicek ke{' '}
            <AccentInk>KBBI</AccentInk> dan tiap aturan{' '}
            <AccentInk tone="indigo">EYD</AccentInk> dicocokkan satu per satu.
            Temuannya dikelompokkan per kategori, lengkap dengan halaman dan
            saran perbaikan.
          </p>
        </div>
      </Section>

      <section
        aria-label="Unggah skripsi"
        className="section-band w-full"
        data-tone="cream"
        data-grid
      >
        <div className="mx-auto w-full max-w-3xl px-6 pt-10 sm:px-8">
        {showDropZone ? <PublicModeNotice /> : null}
        <PdfDropzoneCard
          status={dropzoneStatus}
          onFileSelected={handleFile}
          onReset={reset}
        />
        {showDropZone && (
          <div className="mt-4">
            <DevFixtureButton onPickFile={uploadFile} />
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          {state.step === 'selected' && (
            <Button type="button" onClick={handleEvaluate}>
              Mulai pemeriksaan
              <ArrowUpRight className="size-4" strokeWidth={2} />
            </Button>
          )}
          {state.step === 'uploading' && (
            <span className="inline-flex items-baseline gap-2 pb-1 text-[0.9375rem] text-[var(--sea-ink-soft)]">
              <Loader2
                className="size-4 translate-y-px animate-spin text-[var(--lagoon-deep)]"
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

        </div>
        <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-12 sm:px-8">
          <TierFlowExplainer stats={tierStats} />
        </div>
      </section>

      <AdminSettingsPanel
        id="setelan"
        title="Setelan KBBI"
        description="Mengatur cara CiteTrack memverifikasi kata ke KBBI: kamus lokal saja, proxy Tor, anggaran lookup daring, dan sumber mana yang aktif."
        tone="blush"
        codes={[
          'kbbi.local_only',
          'kbbi.disable_local_dump',
          'kbbi.use_tor_proxy',
          'kbbi.external_lookup_budget',
          'kbbi.external_lookup_timeout_ms',
          'kbbi.source.kemendikdasmen',
          'kbbi.source.web_id',
          'kbbi.source.typoonline',
          'kbbi.source.co_id',
          'kbbi.source.raf555',
        ]}
      />
    </main>
  )
}
