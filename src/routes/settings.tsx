import { useState } from 'react'
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import {
  AlertTriangle,
  Check,
  RotateCcw,
  Search,
  Sparkles as SparklesIcon,
  Trash2,
  X,
} from 'lucide-react'
import { Callout } from '#/components/Callout'
import { CopyIconButton } from '#/components/CopyIconButton'
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
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { isLocalEnv } from '#/env'
import {
  CONFIG_DISPLAY,
  CONFIG_ENUM_OPTIONS,
  CONFIG_KEYWORDS,
  CONFIG_SCHEMAS,
  CONFIG_UNIT_LABEL,
  CONFIG_WARNINGS,
  formatConfigForDisplay,
  parseConfigFromDisplay,
  type ConfigKey,
} from '#/lib/configurations'
import { rankByQuery } from '#/lib/settings-search'
import {
  settingsSearchSchema,
  type SettingsTab,
} from '#/schemas/settings'
import {
  type ConfigurationRow,
  listConfigurations,
  updateConfiguration,
} from '#/services/configurations'
import {
  PRUNE_ALL_CONFIRMATION,
  pruneAll,
  purgeHistory,
  type PruneAllResult,
  type PurgeResult,
} from '#/services/purge'
import {
  isDevEnv,
  usePreviewPublicMode,
} from '#/stores/preview-public-mode'

const configurationsQueryOptions = {
  queryKey: ['configurations'] as const,
  queryFn: () => listConfigurations(),
}

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

type CardTone = 'mint' | 'butter' | 'sky' | 'blush' | 'cream'

function toneForCode(code: ConfigKey): CardTone {
  if (code.startsWith('autofetch.')) return 'mint'
  if (code.startsWith('upload.')) return 'sky'
  if (code.startsWith('purge.')) return 'butter'
  if (code.startsWith('kbbi.')) return 'blush'
  if (code.startsWith('passage.')) return 'blush'
  return 'cream'
}

function groupLabelForCode(code: ConfigKey): string {
  if (code.startsWith('autofetch.')) return 'pencarian otomatis'
  if (code.startsWith('upload.')) return 'unggah'
  if (code.startsWith('purge.')) return 'pembersihan'
  if (code.startsWith('kbbi.')) return 'evaluasi · kbbi'
  if (code.startsWith('passage.')) return 'pencocokan kutipan'
  return 'lainnya'
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

function ConfigCard({ row, idx }: { row: ConfigurationRow; idx: number }) {
  return CONFIG_DISPLAY[row.code] === 'boolean' ? (
    <BooleanConfigurationCard row={row} idx={idx} />
  ) : (
    <ConfigurationCard row={row} idx={idx} />
  )
}

// Turns a mouse-wheel into horizontal scroll while the pointer is over the
// row, so a plain wheel (not just shift+wheel or a trackpad swipe) moves
// through the cards. Attached as a React 19 ref callback with a cleanup
// return and a non-passive listener so preventDefault actually stops the
// page from scrolling vertically instead.
//
// deltaMode matters: Firefox on Linux reports wheel deltas in *lines*
// (deltaMode 1) with small values (~±1–3), so a raw `scrollLeft += deltaY`
// barely moves. Normalise lines→pixels (and pages→viewport) before applying.
function wheelToPixels(e: WheelEvent, viewport: number): number {
  const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
  if (e.deltaMode === 1) return primary * 32
  if (e.deltaMode === 2) return primary * viewport
  return primary
}

function horizontalWheel(el: HTMLOListElement | null) {
  if (!el) return
  const onWheel = (e: WheelEvent) => {
    if (el.scrollWidth <= el.clientWidth) return
    const delta = wheelToPixels(e, el.clientWidth)
    if (delta === 0) return
    el.scrollLeft += delta
    e.preventDefault()
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => el.removeEventListener('wheel', onWheel)
}

// One horizontally-scrolling row of setting cards. Cards keep their full
// height (descriptions wrap, nothing truncates) and the row scrolls sideways
// instead of wrapping into a grid. Focusable children let keyboard users
// reach every card; the browser scrolls them into view on focus.
function SettingsCardRow({ rows }: { rows: ConfigurationRow[] }) {
  return (
    <ol
      ref={horizontalWheel}
      aria-label="Kartu setelan"
      className="-mx-1 flex snap-x gap-6 overflow-x-auto overscroll-x-contain px-1 pb-4 [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin]"
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

function SettingWarning({ text }: { text: string }) {
  return <Callout severity="warning">{text}</Callout>
}

function SettingCardHeader({
  idx,
  groupLabel,
  label,
  isDefault,
}: {
  idx: number
  groupLabel: string
  label: string
  isDefault: boolean
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="kicker tabular-nums text-[var(--ink-faint)]">
          №{String(idx + 1).padStart(2, '0')} · {groupLabel}
        </span>
        <h2 className="display-title text-[1.375rem] font-extrabold leading-tight text-[var(--ink)]">
          {label}
        </h2>
      </div>
      <span
        className="severity-badge shrink-0"
        data-severity={isDefault ? 'info' : 'warning'}
      >
        {isDefault ? 'bawaan' : 'diubah'}
      </span>
    </header>
  )
}

function ConfigurationCard({
  row,
  idx,
}: {
  row: ConfigurationRow
  idx: number
}) {
  const queryClient = useQueryClient()
  const tone = toneForCode(row.code)
  const groupLabel = groupLabelForCode(row.code)

  const mutation = useMutation({
    mutationFn: (input: { code: ConfigKey; value: unknown }) =>
      updateConfiguration({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
    },
  })

  const form = useForm({
    defaultValues: { value: formatConfigForDisplay(row.code, row.value) },
    onSubmit: ({ value }) => {
      const parsed = parseConfigFromDisplay(row.code, value.value)
      if (parsed === null) return
      mutation.mutate({ code: row.code, value: parsed })
    },
  })

  const reset = () => {
    mutation.mutate({ code: row.code, value: row.defaultValue })
    form.setFieldValue(
      'value',
      formatConfigForDisplay(row.code, row.defaultValue),
    )
  }

  const unitLabel = CONFIG_UNIT_LABEL[row.code]
  const isEnum = CONFIG_DISPLAY[row.code] === 'enum'
  const enumOptions = isEnum ? CONFIG_ENUM_OPTIONS[row.code] : undefined

  return (
    <article
      className="soft-card relative flex h-full flex-col gap-3 p-6"
      data-tone={tone}
    >
      <SettingCardHeader
        idx={idx}
        groupLabel={groupLabel}
        label={row.label}
        isDefault={row.isDefault}
      />

      <p className="kicker -mt-1 font-mono normal-case tracking-normal text-[var(--ink-faint)]">
        {row.code}
      </p>

      <p className="text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {row.description}
      </p>

      {CONFIG_WARNINGS[row.code] && (
        <SettingWarning text={CONFIG_WARNINGS[row.code]!} />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="mt-auto flex flex-col gap-3 pt-1"
      >
        <form.Field
          name="value"
          validators={{
            onChange: ({ value }) => {
              const parsed = parseConfigFromDisplay(row.code, value)
              if (parsed === null) {
                if (isEnum) return 'Pilih salah satu opsi di atas'
                if (unitLabel === 'seconds') {
                  return 'Harus berupa angka positif (mis. 30, 0.5, 3.4s)'
                }
                if (unitLabel === 'MB') {
                  return 'Harus berupa angka positif (mis. 50, 12.5)'
                }
                return 'Harus berupa bilangan bulat positif'
              }
              const result = CONFIG_SCHEMAS[row.code].safeParse(parsed)
              if (!result.success) {
                return result.error.issues.map((i) => i.message).join('; ')
              }
              return undefined
            },
          }}
        >
          {(field) => {
            const hasError = field.state.meta.errors.length > 0
            const errorId = `field-${row.code}-error`
            return (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`field-${row.code}`} className="sr-only">
                {row.label}
              </Label>
              {isEnum && enumOptions ? (
                <>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v)}
                  >
                    <SelectTrigger
                      id={`field-${row.code}`}
                      aria-invalid={hasError}
                      aria-describedby={hasError ? errorId : undefined}
                      className="h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 font-mono text-sm shadow-none focus-visible:border-[var(--accent-coral)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/25"
                    >
                      <SelectValue placeholder="Pilih model" />
                    </SelectTrigger>
                    <SelectContent>
                      {enumOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="font-mono text-[0.8125rem] text-[var(--ink)]">
                            {opt.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {enumOptions.find((o) => o.value === field.state.value)
                    ?.hint && (
                    <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]">
                      {
                        enumOptions.find((o) => o.value === field.state.value)
                          ?.hint
                      }
                    </p>
                  )}
                </>
              ) : (
                <div className="relative">
                  <Input
                    id={`field-${row.code}`}
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? errorId : undefined}
                    className={`h-12 rounded-xl border border-[var(--line)] bg-white px-4 font-mono text-lg tabular-nums shadow-none focus-visible:border-[var(--accent-coral)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/25 ${unitLabel ? 'pr-20' : ''}`}
                  />
                  {unitLabel && (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <span className="kicker rounded-full bg-[var(--bg-cream)] px-2.5 py-1 text-[var(--ink-soft)]">
                        {unitLabel}
                      </span>
                    </span>
                  )}
                </div>
              )}
              {hasError && (
                <p id={errorId} className="text-[0.8125rem] text-[var(--accent-coral-deep)]">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
              <p className="kicker text-[var(--ink-faint)]">
                bawaan{' '}
                <span className="font-mono normal-case tracking-normal text-[var(--ink)]">
                  {formatConfigForDisplay(row.code, row.defaultValue)}
                </span>
                {unitLabel ? ` ${unitLabel}` : ''}
                {unitLabel === 'seconds' && (
                  <>
                    {' · disimpan sebagai '}
                    <span className="font-mono normal-case tracking-normal text-[var(--ink)]">
                      {String(row.defaultValue)}
                    </span>{' '}
                    ms
                  </>
                )}
                {unitLabel === 'MB' && typeof row.defaultValue === 'number' && (
                  <>
                    {' · disimpan sebagai '}
                    <span className="font-mono normal-case tracking-normal text-[var(--ink)]">
                      {row.defaultValue.toLocaleString('en-US')}
                    </span>{' '}
                    bytes
                  </>
                )}
              </p>
            </div>
            )
          }}
        </form.Field>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit || mutation.isPending}
              >
                {mutation.isPending ? (
                  'Menyimpan…'
                ) : mutation.isSuccess && !isSubmitting ? (
                  <>
                    <Check className="size-4" strokeWidth={2} />
                    Tersimpan
                  </>
                ) : (
                  'Simpan'
                )}
              </Button>
            )}
          </form.Subscribe>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reset}
            disabled={row.isDefault || mutation.isPending}
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            kembali ke bawaan
          </Button>

          {mutation.isError && (
            <p
              role="alert"
              className="basis-full text-[0.8125rem] text-[var(--accent-coral-deep)]"
            >
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'Gagal menyimpan'}
            </p>
          )}
        </div>
      </form>
    </article>
  )
}

function BooleanConfigurationCard({
  row,
  idx,
}: {
  row: ConfigurationRow
  idx: number
}) {
  const queryClient = useQueryClient()
  const tone = toneForCode(row.code)
  const groupLabel = groupLabelForCode(row.code)

  const mutation = useMutation({
    mutationFn: (input: { code: ConfigKey; value: unknown }) =>
      updateConfiguration({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
    },
  })

  const checked = row.value === 1

  return (
    <article
      className="soft-card relative flex h-full flex-col gap-3 p-6"
      data-tone={tone}
    >
      <SettingCardHeader
        idx={idx}
        groupLabel={groupLabel}
        label={row.label}
        isDefault={row.isDefault}
      />

      <p className="kicker -mt-1 font-mono normal-case tracking-normal text-[var(--ink-faint)]">
        {row.code}
      </p>

      <p className="text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {row.description}
      </p>

      {CONFIG_WARNINGS[row.code] && (
        <SettingWarning text={CONFIG_WARNINGS[row.code]!} />
      )}

      <div className="mt-auto flex items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <Switch
            id={`field-${row.code}`}
            checked={checked}
            disabled={mutation.isPending}
            onCheckedChange={(next) =>
              mutation.mutate({ code: row.code, value: next ? 1 : 0 })
            }
          />
          <Label
            htmlFor={`field-${row.code}`}
            className="text-[0.9375rem] font-medium text-[var(--ink)]"
          >
            {checked ? 'aktif' : 'nonaktif'}
          </Label>
        </div>
        <p className="kicker text-[var(--ink-faint)]">
          bawaan{' '}
          <span className="font-mono normal-case tracking-normal text-[var(--ink)]">
            {row.defaultValue === 1 ? 'aktif' : 'nonaktif'}
          </span>
        </p>
      </div>

      {mutation.isError && (
        <p
          role="alert"
          className="text-[0.8125rem] text-[var(--accent-coral-deep)]"
        >
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Gagal menyimpan'}
        </p>
      )}
    </article>
  )
}

// Short, one-line copy per kbbi.source.* row. The longer copy lives in
// configurations.ts and shows up as the tooltip on hover.
const KBBI_SOURCE_BLURB: Record<string, string> = {
  'kbbi.source.kemendikdasmen': 'Sumber resmi. Batas harian per-IP cepat habis.',
  'kbbi.source.web_id':
    'Cepat dan stabil, cakupan KBBI V. Biasanya jadi yang pertama dapat hasil.',
  'kbbi.source.typoonline': 'Cadangan ringan untuk cek kata baku.',
  'kbbi.source.co_id':
    'Sering balas 429. Default mati; nyalakan kalau butuh sumber tambahan.',
  'kbbi.source.raf555':
    'Cakupan KBBI VI dari APK resmi v6.1.0. Sering nemu kata yang sumber lain lewat.',
}

// Host + clickable URL per source. Domain shows in the row; the icon
// next to it copies the full URL so the admin can paste it into a browser
// or curl.
const KBBI_SOURCE_URL: Record<string, { host: string; url: string }> = {
  'kbbi.source.kemendikdasmen': {
    host: 'kbbi.kemendikdasmen.go.id',
    url: 'https://kbbi.kemendikdasmen.go.id/',
  },
  'kbbi.source.web_id': { host: 'kbbi.web.id', url: 'https://kbbi.web.id/' },
  'kbbi.source.typoonline': {
    host: 'typoonline.com',
    url: 'https://typoonline.com/kbbi/',
  },
  'kbbi.source.co_id': { host: 'kbbi.co.id', url: 'https://kbbi.co.id/' },
  'kbbi.source.raf555': {
    host: 'kbbi.raf555.dev',
    url: 'https://kbbi.raf555.dev/api/v1/entry/',
  },
}

function shortSourceLabel(label: string): string {
  return label.replace(/^Sumber:\s*/i, '')
}

function CopyUrlButton({ url, label }: { url: string; label: string }) {
  return (
    <CopyIconButton
      text={url}
      idleLabel={`Salin URL ${label}`}
      copiedLabel={`URL ${label} tersalin`}
      tone="indigo"
      className="p-1 text-[var(--ink-faint)] hover:bg-[var(--bg-cream)] hover:text-[var(--ink)]"
    />
  )
}

function KbbiSourcesCard({ rows }: { rows: ConfigurationRow[] }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { code: ConfigKey; value: unknown }) =>
      updateConfiguration({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
    },
  })

  return (
    <article
      className="soft-card flex flex-col gap-5 p-7"
      data-tone="blush"
      aria-label="Sumber KBBI"
    >
      <header className="flex flex-col gap-1">
        <span className="kicker text-[var(--ink-faint)]">
          evaluasi · kbbi
        </span>
        <h2 className="display-title text-[1.375rem] font-extrabold leading-tight text-[var(--ink)]">
          Sumber KBBI
        </h2>
        <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Setiap kata diverifikasi ke sumber yang aktif. Kalau salah satu
          kena rate-limit, CiteTrack pindah ke berikutnya.
        </p>
      </header>

      <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white/60">
        {rows.map((row) => {
          const checked = row.value === 1
          const label = shortSourceLabel(row.label)
          const blurb = KBBI_SOURCE_BLURB[row.code] ?? row.description
          const link = KBBI_SOURCE_URL[row.code]
          const drifted = !row.isDefault
          return (
            <li
              key={row.code}
              className="flex items-center gap-5 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[0.9375rem] font-semibold text-[var(--ink)]">
                    {label}
                  </p>
                  {drifted && (
                    <span
                      className="severity-badge"
                      data-severity="warning"
                    >
                      diubah
                    </span>
                  )}
                </div>
                <p
                  className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]"
                  title={row.description}
                >
                  {blurb}
                </p>
                {link && (
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.75rem] text-[var(--ink-faint)]">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-2 hover:text-[var(--ink)] hover:underline"
                    >
                      {link.host}
                    </a>
                    <CopyUrlButton url={link.url} label={label} />
                    <span aria-hidden className="text-[var(--ink-faint)]/60">
                      ·
                    </span>
                    <span className="kicker normal-case tracking-normal">
                      bawaan{' '}
                      <span className="text-[var(--ink)]">
                        {row.defaultValue === 1 ? 'aktif' : 'nonaktif'}
                      </span>
                    </span>
                  </p>
                )}
              </div>
              <Switch
                id={`field-${row.code}`}
                aria-label={`Aktifkan ${label}`}
                checked={checked}
                disabled={mutation.isPending}
                onCheckedChange={(next) =>
                  mutation.mutate({ code: row.code, value: next ? 1 : 0 })
                }
              />
            </li>
          )
        })}
      </ul>

      {mutation.isError && (
        <p className="text-[0.8125rem] text-[var(--accent-coral-deep)]">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Gagal menyimpan'}
        </p>
      )}
    </article>
  )
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

function PurgeSection() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<'idle' | 'confirming'>('idle')

  const mutation = useMutation({
    mutationFn: () => purgeHistory(),
    onSuccess: () => {
      setPhase('idle')
      queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const result: PurgeResult | undefined = mutation.data

  return (
    <article
      className="soft-card mt-10 grid gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto]"
      data-tone="blush"
    >
      <div className="min-w-0">
        <span className="kicker text-[var(--accent-coral-deep)]">
          zona hapus
        </span>
        <h2 className="display-title mt-2 text-[1.75rem] font-extrabold leading-tight text-[var(--ink)]">
          Bersihkan riwayat & berkas lama
        </h2>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Menghapus pekerjaan yang sudah selesai (berhasil maupun gagal)
          beserta PDF yang menyertainya. Pekerjaan yang masih jalan tidak
          disentuh. Lama penyimpanan dan masa tenggang diatur di kartu-kartu
          di atas.
        </p>

        {result && !mutation.isPending && (
          <div className="mt-6">
            <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-5">
                <p className="kicker mb-3 inline-flex items-center gap-1.5 text-[var(--accent-indigo-deep)]">
                  <Check
                    className="size-3.5 text-[var(--accent-indigo-deep)]"
                    strokeWidth={2}
                  />
                  Selesai
                </p>
                <dl className="grid grid-cols-1 gap-y-2 text-[0.875rem] sm:grid-cols-2 sm:gap-x-8">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-soft)]">Pelacakan sitasi</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {result.trackJobsDeleted}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-soft)]">Evaluasi naskah</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {result.evaluationJobsDeleted}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-soft)]">PDF sumber</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {result.sourcePdfsDeleted}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-soft)]">Berkas dihapus</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {result.filesDeleted}{' '}
                      <span className="text-[var(--ink-faint)]">
                        ({formatBytes(result.bytesFreed)})
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 sm:col-span-2">
                    <dt className="text-[var(--ink-soft)]">
                      Berkas tertinggal dibersihkan
                    </dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {result.orphanFilesDeleted}{' '}
                      <span className="text-[var(--ink-faint)]">
                        ({formatBytes(result.orphanBytesFreed)})
                      </span>
                    </dd>
                  </div>
                </dl>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-stretch justify-start gap-3 lg:items-end">
        {phase === 'idle' && !mutation.isPending && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setPhase('confirming')}
            disabled={mutation.isPending}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Bersihkan sekarang
          </Button>
        )}

        {phase === 'confirming' && !mutation.isPending && (
          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <p className="text-[0.875rem] italic text-[var(--ink-soft)] lg:text-right">
              Yakin? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button
                type="button"
                variant="destructive"
                onClick={() => mutation.mutate(undefined)}
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
                Ya, hapus
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhase('idle')}
              >
                batal
              </Button>
            </div>
          </div>
        )}

        {mutation.isPending && (
          <span className="kicker dots-loop self-center text-[var(--ink-soft)] lg:self-end">
            Menghapus<span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}

        {mutation.isError && (
          <p
            role="alert"
            className="max-w-xs text-[0.8125rem] text-[var(--accent-coral-deep)] lg:text-right"
          >
            <AlertTriangle
              className="mr-1 inline size-3.5 -translate-y-px"
              strokeWidth={1.75}
            />
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Gagal menghapus'}
          </p>
        )}
      </div>
    </article>
  )
}

function PruneAllSection() {
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      pruneAll({ data: { confirmation: PRUNE_ALL_CONFIRMATION } }),
    onSuccess: () => {
      setConfirmation('')
      queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const result: PruneAllResult | undefined = mutation.data
  const confirmed = confirmation.trim() === PRUNE_ALL_CONFIRMATION
  const canSubmit = confirmed && !mutation.isPending

  return (
    <article
      className="soft-card mt-6 grid gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto]"
      data-tone="blush"
    >
      <div className="min-w-0">
        <span className="kicker text-[var(--accent-coral-deep)]">
          zona hapus
        </span>
        <h2 className="display-title mt-2 text-[1.75rem] font-extrabold leading-tight text-[var(--ink)]">
          Hapus semua data
        </h2>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Hapus <span className="font-semibold text-[var(--ink)]">semua</span>{' '}
          pekerjaan Track, semua evaluasi, semua temuan, dan semua berkas
          PDF — termasuk yang masih berjalan. Tidak ada masa retensi, tidak
          ada masa tenggang. Tindakan ini tidak bisa dibatalkan.
        </p>
        <p className="mt-3 max-w-prose text-[0.875rem] italic text-[var(--ink-soft)]">
          Ketik{' '}
          <code className="rounded bg-[var(--bg-cream)] px-1.5 py-0.5 font-mono text-[0.8125rem] not-italic text-[var(--ink)]">
            {PRUNE_ALL_CONFIRMATION}
          </code>{' '}
          di bawah untuk membuka tombolnya.
        </p>

        <div className="mt-5 max-w-md">
          <Label htmlFor="prune-confirmation" className="sr-only">
            Konfirmasi
          </Label>
          <Input
            id="prune-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={PRUNE_ALL_CONFIRMATION}
            autoComplete="off"
            spellCheck={false}
            disabled={mutation.isPending}
            className="h-11 rounded-xl border border-[var(--line)] bg-white px-4 font-mono text-sm shadow-none focus-visible:border-[var(--accent-coral)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/25"
          />
        </div>

        {result && !mutation.isPending && (
          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white/70 p-5">
            <p className="kicker mb-3 inline-flex items-center gap-1.5 text-[var(--accent-indigo-deep)]">
              <Check
                className="size-3.5 text-[var(--accent-indigo-deep)]"
                strokeWidth={2}
              />
              Selesai
            </p>
            <dl className="grid grid-cols-1 gap-y-2 text-[0.875rem] sm:grid-cols-2 sm:gap-x-8">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-soft)]">Pelacakan sitasi</dt>
                <dd className="font-mono tabular-nums text-[var(--ink)]">
                  {result.trackJobsDeleted}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-soft)]">Evaluasi naskah</dt>
                <dd className="font-mono tabular-nums text-[var(--ink)]">
                  {result.evaluationJobsDeleted}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-soft)]">PDF sumber</dt>
                <dd className="font-mono tabular-nums text-[var(--ink)]">
                  {result.sourcePdfsDeleted}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--ink-soft)]">Berkas dihapus</dt>
                <dd className="font-mono tabular-nums text-[var(--ink)]">
                  {result.filesDeleted}{' '}
                  <span className="text-[var(--ink-faint)]">
                    ({formatBytes(result.bytesFreed)})
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="flex flex-col items-stretch justify-start gap-3 lg:items-end">
        <Button
          type="button"
          variant="destructive"
          onClick={() => mutation.mutate(undefined)}
          disabled={!canSubmit}
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
          Hapus semua sekarang
        </Button>
        <p className="text-[0.75rem] text-[var(--ink-soft)] lg:text-right">
          Tombol aktif setelah konfirmasi cocok persis.
        </p>

        {mutation.isPending && (
          <span className="kicker dots-loop self-center text-[var(--ink-soft)] lg:self-end">
            Menghapus<span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}

        {mutation.isError && (
          <p
            role="alert"
            className="max-w-xs text-[0.8125rem] text-[var(--accent-coral-deep)] lg:text-right"
          >
            <AlertTriangle
              className="mr-1 inline size-3.5 -translate-y-px"
              strokeWidth={1.75}
            />
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Gagal menghapus'}
          </p>
        )}
      </div>
    </article>
  )
}
