import { createFileRoute, notFound } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Sparkles as SparklesIcon } from 'lucide-react'
import { Callout } from '#/components/Callout'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  Arrow,
  DottedArc,
  PaperPlane,
  Sparkles,
  Squiggle,
  StarBurst,
  Underline,
} from '#/components/doodles'
import { Switch } from '#/components/ui/switch'
import { ConfigCard } from '#/components/settings/config-cards'
import {
  PruneAllSection,
  PurgeSection,
} from '#/components/settings/purge-sections'
import { configurationsQueryOptions } from '#/components/settings/shared'
import { isLocalEnv } from '#/env'
import type { ConfigKey } from '#/lib/configurations'
import {
  isDevEnv,
  usePreviewPublicMode,
} from '#/stores/preview-public-mode'

// Settings that aren't tied to a single feature. Per-feature config
// (autofetch, passage matching, KBBI) lives in admin panels on /track and
// /evaluation; this page keeps only the cross-cutting knobs.
const GLOBAL_CODES: readonly ConfigKey[] = [
  'upload.max_file_size_bytes',
  'purge.retention_days',
  'purge.orphan_grace_hours',
]

export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(configurationsQueryOptions),
  head: () => ({ meta: [{ title: 'Settings · CiteTrack' }] }),
  component: SettingsPage,
})

function SettingsPage() {
  const { data } = useQuery({
    ...configurationsQueryOptions,
    staleTime: 30_000,
  })

  if (!data) return null

  const codeOrder = new Map(GLOBAL_CODES.map((code, i) => [code, i]))
  const rows = data
    .filter((row) => codeOrder.has(row.code))
    .toSorted(
      (a, b) => (codeOrder.get(a.code) ?? 0) - (codeOrder.get(b.code) ?? 0),
    )

  return (
    <main id="main-content" className="flex-1">
      <Section tone="mint" grid innerClassName="relative pb-12 pt-14">
        <Sparkles
          tone="indigo"
          size={42}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <DottedArc
          tone="coral"
          size={120}
          className="absolute right-[12%] top-[7rem] hidden lg:block"
        />
        <PaperPlane
          tone="coral"
          size={32}
          className="absolute right-[6%] top-[10rem] rotate-[18deg] hidden lg:block"
        />
        <Squiggle
          tone="indigo"
          size={56}
          className="absolute left-[6%] bottom-8 hidden md:block"
        />
        <StarBurst
          tone="indigo"
          size={20}
          className="absolute left-[18%] top-12 hidden md:block"
        />
        <Arrow
          tone="coral"
          size={48}
          className="absolute right-[26%] bottom-10 -rotate-[10deg] hidden lg:block"
        />

        <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-indigo-deep)]">
          <StarBurst tone="indigo" size={14} />
          Admin · Setelan global
        </span>
        <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Atur cara kerja <Marker tone="green">sistem</Marker>.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Ukuran unggahan maksimum dan kapan riwayat{' '}
          <AccentInk tone="indigo">dibersihkan</AccentInk>. Setelan khusus tiap
          fitur — pencarian otomatis, pencocokan kutipan, dan KBBI — ada di
          halaman Pelacakan dan Evaluasi. Perubahan terbaca paling lambat 30
          detik setelah disimpan.
        </p>
        <Underline
          tone="coral"
          size={140}
          className="mt-3 block opacity-60"
        />
        <UnlockNotice />
      </Section>

      <Section tone="cream" innerClassName="pb-20 pt-12">
        <div className="mx-auto w-full max-w-[80rem]">
          {rows.length > 0 ? (
            <div className="grid items-stretch gap-6 md:grid-cols-2">
              {rows.map((row, idx) => (
                <ConfigCard key={row.code} row={row} idx={idx} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/40 px-6 py-10 text-center text-[0.9375rem] text-[var(--ink-soft)]">
              Belum ada konfigurasi global.
            </p>
          )}

          <PurgeSection />
          <PruneAllSection />

          <PreviewPublicModeSection />
        </div>
      </Section>
    </main>
  )
}

function PreviewPublicModeSection() {
  const enabled = usePreviewPublicMode((s) => s.enabled)
  const setEnabled = usePreviewPublicMode((s) => s.setEnabled)

  if (!isDevEnv) return null

  return (
    <section
      className="soft-card mt-10 p-6"
      data-tone="cream"
      aria-label="Preview demo publik"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-prose">
          <p className="kicker text-[var(--ink-soft)]">dev only</p>
          <p className="display-title mt-1 text-xl font-semibold text-[var(--ink)]">
            Preview demo publik
          </p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
            Tampilkan UI seperti yang dilihat pengunjung demo: badge di
            header, callout di /track dan /evaluation, nav item Riwayat,
            Setelan, dan 3rd Party Logs disembunyikan. Server function
            tetap memakai env.PUBLIC_MODE, hanya tampilan klien yang
            berubah. Halaman ini sengaja tetap terbuka supaya kamu bisa
            mematikannya.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Aktifkan preview demo publik"
        />
      </div>
    </section>
  )
}

function UnlockNotice() {
  return (
    <Callout
      severity="warning"
      icon={<SparklesIcon className="size-4" strokeWidth={1.75} />}
      className="mt-6 w-fit max-w-prose"
    >
      Halaman ini terbuka.{' '}
      <span className="text-[var(--ink-soft)]">
        Siapa pun yang bisa mengakses server ini bisa mengubah nilai di bawah,
        jadi ubah dengan hati-hati.
      </span>
    </Callout>
  )
}
