import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Search,
  Sparkles as SparklesIcon,
  X,
} from 'lucide-react'
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
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { ConfigCard } from '#/components/settings/config-cards'
import { KbbiSourcesCard } from '#/components/settings/kbbi-sources-card'
import {
  PruneAllSection,
  PurgeSection,
} from '#/components/settings/purge-sections'
import { configurationsQueryOptions, groupLabelForCode } from '#/components/settings/shared'
import { isLocalEnv } from '#/env'
import { CONFIG_KEYWORDS } from '#/lib/configurations'
import { rankByQuery } from '#/lib/settings-search'
import {
  settingsSearchSchema,
  type SettingsTab,
} from '#/schemas/settings'
import { type ConfigurationRow } from '#/services/configurations'
import {
  isDevEnv,
  usePreviewPublicMode,
} from '#/stores/preview-public-mode'

export const Route = createFileRoute('/settings')({
  validateSearch: zodValidator(settingsSearchSchema),
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(configurationsQueryOptions),
  head: () => ({ meta: [{ title: 'Settings · CiteTrack' }] }),
  component: SettingsPage,
})

type TabConfig = {
  key: SettingsTab
  label: string
  prefixes: readonly string[]
}

const TABS: readonly TabConfig[] = [
  { key: 'autofetch', label: 'Pencarian otomatis', prefixes: ['autofetch.'] },
  { key: 'upload', label: 'Unggah', prefixes: ['upload.'] },
  { key: 'purge', label: 'Pembersihan', prefixes: ['purge.'] },
  { key: 'kbbi', label: 'Evaluasi · KBBI', prefixes: ['kbbi.'] },
  { key: 'passage', label: 'Pencocokan kutipan', prefixes: ['passage.'] },
] as const

function rowMatchesTab(row: ConfigurationRow, tab: TabConfig): boolean {
  return tab.prefixes.some((p) => row.code.startsWith(p))
}

function settingsHaystack(row: ConfigurationRow): string {
  const keywords = CONFIG_KEYWORDS[row.code]?.join(' ') ?? ''
  return `${row.code} ${row.label} ${row.description} ${keywords} ${groupLabelForCode(row.code)}`
}

function SettingsPage() {
  const { tab: activeTab, q } = Route.useSearch()
  const { data } = useQuery({
    ...configurationsQueryOptions,
    staleTime: 30_000,
  })

  if (!data) return null

  const query = q.trim()
  const searching = query.length > 0

  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]!
  const allTabRows = data.filter((row) => rowMatchesTab(row, active))
  // KBBI source toggles collapse into one combined card. Everything else in
  // the kbbi tab (lookup budget, tor proxy, local dump bypass) keeps the
  // individual-card treatment.
  const sourceRows =
    active.key === 'kbbi'
      ? allTabRows.filter((r) => r.code.startsWith('kbbi.source.'))
      : []
  const visibleRows = allTabRows.filter(
    (r) => !r.code.startsWith('kbbi.source.'),
  )

  // Search runs across every setting in every tab — including each KBBI
  // source toggle — so a query lands on the right card no matter which tab
  // it lives under. Source toggles are booleans, so they render as the same
  // BooleanConfigurationCard used elsewhere.
  const matchedRows = searching ? rankByQuery(query, data, settingsHaystack) : []

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
          Admin · Setelan
        </span>
        <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Atur cara kerja <Marker tone="green">sistem</Marker>.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Batas waktu pencarian sumber, ukuran unggahan maksimum, dan kapan
          riwayat <AccentInk tone="indigo">dibersihkan</AccentInk>. Perubahan
          terbaca paling lambat 30 detik setelah disimpan.
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
          <SettingsSearch q={q} />
          <SettingsTabs active={active.key} dimmed={searching} />

          {searching ? (
            <SearchResults query={query} rows={matchedRows} />
          ) : (
            <>
              {visibleRows.length > 0 && <SettingsCardRow rows={visibleRows} />}

              {sourceRows.length > 0 && (
                <div className="mt-6">
                  <KbbiSourcesCard rows={sourceRows} />
                </div>
              )}

              {visibleRows.length === 0 && sourceRows.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/40 px-6 py-10 text-center text-[0.9375rem] text-[var(--ink-soft)]">
                  Belum ada konfigurasi di kategori ini.
                </p>
              )}
            </>
          )}

          {active.key === 'purge' && (
            <>
              <PurgeSection />
              <PruneAllSection />
            </>
          )}

          <PreviewPublicModeSection />
        </div>
      </Section>
    </main>
  )
}

// One horizontally-scrolling row of setting cards. Cards keep their full
// height (descriptions wrap, nothing truncates) and the row scrolls sideways
// instead of wrapping into a grid. Scrolling is plain native overflow — the
// `cards-scroll` class gives it a chunky, always-visible scrollbar so the
// affordance reads clearly. Focusable children let keyboard users reach every
// card; the browser scrolls them into view on focus.
function SettingsCardRow({ rows }: { rows: ConfigurationRow[] }) {
  return (
    <div>
      {rows.length > 1 && (
        <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] text-[var(--ink-faint)]">
          <ArrowLeftRight aria-hidden className="size-3.5" strokeWidth={1.75} />
          Geser ke samping untuk melihat semua kartu
        </p>
      )}
      <ol
        aria-label="Kartu setelan"
        className="cards-scroll -mx-1 flex snap-x gap-6 overflow-x-auto overscroll-x-contain px-1 pb-4"
      >
        {rows.map((row, idx) => (
          <li
            key={row.code}
            className="w-[32rem] max-w-[90vw] shrink-0 snap-start"
          >
            <ConfigCard row={row} idx={idx} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function SearchResults({
  query,
  rows,
}: {
  query: string
  rows: ConfigurationRow[]
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/40 px-6 py-10 text-center text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Tidak ada setelan yang cocok dengan “{query}”. Coba kata kunci lain
        seperti “unggah”, “riwayat”, atau “kbbi”.
      </p>
    )
  }

  return (
    <section aria-label={`Hasil pencarian untuk ${query}`}>
      <p className="mb-5 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Menampilkan{' '}
        <span className="font-semibold text-[var(--ink)]">{rows.length}</span>{' '}
        setelan dari semua kategori untuk{' '}
        <span className="font-semibold text-[var(--ink)]">“{query}”</span>.
      </p>
      <SettingsCardRow rows={rows} />
    </section>
  )
}

function SettingsSearch({ q }: { q: string }) {
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <div className="mb-6 max-w-xl">
      <Label htmlFor="settings-search" className="sr-only">
        Cari setelan
      </Label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-faint)]"
          strokeWidth={1.75}
        />
        <Input
          id="settings-search"
          type="text"
          value={q}
          onChange={(e) =>
            navigate({
              search: (prev) => ({ ...prev, q: e.target.value }),
              replace: true,
              // Keep the viewport where it is; without this every keystroke
              // resets scroll to 0,0 and snaps back up to the hero band.
              resetScroll: false,
            })
          }
          placeholder="Cari setelan… mis. ukuran unggah, lama simpan"
          autoComplete="off"
          className="h-12 rounded-full pr-11 pl-11"
        />
        {q.length > 0 && (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() =>
              navigate({
                search: (prev) => ({ ...prev, q: '' }),
                replace: true,
                resetScroll: false,
              })
            }
            className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--ink-faint)] transition-colors hover:bg-[var(--bg-cream)] hover:text-[var(--ink)]"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  )
}

function SettingsTabs({
  active,
  dimmed,
}: {
  active: SettingsTab
  dimmed: boolean
}) {
  // URL-driven section navigation, not an in-page tab widget. Modeled
  // as `<nav>` with `aria-current="page"` so the active section is
  // exposed to AT — APG Tabs would require a `tabpanel` companion
  // and arrow-key roving, which doesn't match the deep-linkable
  // routing model here. While a search is active the tabs dim to signal
  // that results span every category; clicking one clears the query
  // (the Link sets `search` to just `{ tab }`, dropping `q`).
  return (
    <nav
      aria-label="Setelan"
      className={`mb-8 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-b border-[var(--line)] pb-3 transition-opacity ${
        dimmed ? 'opacity-55' : ''
      }`}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            aria-current={isActive ? 'page' : undefined}
            to="/settings"
            search={{ tab: tab.key }}
            className={`focus-ring group relative inline-flex items-baseline gap-1.5 pb-1 text-sm transition-colors ${
              isActive
                ? 'font-medium text-foreground'
                : 'text-[var(--sea-ink-soft)] hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            <span
              aria-hidden
              className={`absolute -bottom-[calc(0.75rem+1px)] left-0 h-px w-full origin-left bg-[var(--sea-ink)] transition-transform duration-200 ${
                isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
              }`}
            />
          </Link>
        )
      })}
    </nav>
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
