import { useState } from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { AlertTriangle, Check, RotateCcw, Sparkles as SparklesIcon, Trash2 } from 'lucide-react'
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
  CONFIG_SCHEMAS,
  CONFIG_UNIT_LABEL,
  formatConfigForDisplay,
  parseConfigFromDisplay,
  type ConfigKey,
} from '#/lib/configurations'
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
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings · CiteTrack' }] }),
  validateSearch: zodValidator(settingsSearchSchema),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(configurationsQueryOptions),
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

function SettingsPage() {
  const { tab: activeTab } = Route.useSearch()
  const { data } = useQuery({
    ...configurationsQueryOptions,
    staleTime: 30_000,
  })

  if (!data) return null

  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]!
  const visibleRows = data.filter((row) => rowMatchesTab(row, active))

  return (
    <main className="flex-1">
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
          <SettingsTabs active={active.key} />

          <ol className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visibleRows.map((row, idx) => (
              <li key={row.code}>
                {CONFIG_DISPLAY[row.code] === 'boolean' ? (
                  <BooleanConfigurationCard row={row} idx={idx} />
                ) : (
                  <ConfigurationCard row={row} idx={idx} />
                )}
              </li>
            ))}
          </ol>

          {visibleRows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/40 px-6 py-10 text-center text-[0.9375rem] text-[var(--ink-soft)]">
              Belum ada konfigurasi di kategori ini.
            </p>
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

function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <div
      role="tablist"
      aria-label="Setelan"
      className="mb-8 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-b border-[var(--line)] pb-3"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            to="/settings"
            search={{ tab: tab.key }}
            className={`group relative inline-flex items-baseline gap-1.5 pb-1 text-sm transition-colors ${
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
    </div>
  )
}

function PreviewPublicModeSection() {
  const enabled = usePreviewPublicMode((s) => s.enabled)
  const setEnabled = usePreviewPublicMode((s) => s.setEnabled)

  if (!isDevEnv) return null

  return (
    <section
      className="soft-card mt-10 px-6 py-6"
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
    <div className="mt-6 inline-flex max-w-prose items-start gap-2.5 rounded-2xl border border-[color-mix(in_oklab,var(--marker-yellow)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-butter)_70%,#ffffff)] px-4 py-3">
      <SparklesIcon
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-coral-deep)]"
        strokeWidth={1.75}
      />
      <p className="text-[0.875rem] leading-relaxed text-[var(--ink)]">
        Halaman ini terbuka.{' '}
        <span className="text-[var(--ink-soft)]">
          Siapa pun yang bisa mengakses server ini bisa mengubah nilai di
          bawah, jadi ubah dengan hati-hati.
        </span>
      </p>
    </div>
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
      className="soft-card relative flex h-full flex-col gap-4 p-7"
      data-tone={tone}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="kicker tabular-nums text-[var(--ink-faint)]">
            №{String(idx + 1).padStart(2, '0')} · {groupLabel}
          </span>
          <h2 className="display-title text-[1.375rem] font-extrabold leading-tight text-[var(--ink)]">
            {row.label}
          </h2>
        </div>
        <span
          className="severity-badge shrink-0"
          data-severity={row.isDefault ? 'info' : 'warning'}
        >
          {row.isDefault ? 'bawaan' : 'diubah'}
        </span>
      </header>

      <p className="kicker -mt-1 font-mono normal-case tracking-normal text-[var(--ink-faint)]">
        {row.code}
      </p>

      <p className="text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {row.description}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="mt-auto flex flex-col gap-3 pt-2"
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
          {(field) => (
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
                      aria-invalid={field.state.meta.errors.length > 0}
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
                    aria-invalid={field.state.meta.errors.length > 0}
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
              {field.state.meta.errors.length > 0 && (
                <p className="text-[0.8125rem] text-[var(--accent-coral-deep)]">
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
          )}
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
                    <Check className="h-4 w-4" strokeWidth={2} />
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
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            kembali ke bawaan
          </Button>

          {mutation.isError && (
            <p className="basis-full text-[0.8125rem] text-[var(--accent-coral-deep)]">
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
      className="soft-card relative flex h-full flex-col gap-4 p-7"
      data-tone={tone}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="kicker tabular-nums text-[var(--ink-faint)]">
            №{String(idx + 1).padStart(2, '0')} · {groupLabel}
          </span>
          <h2 className="display-title text-[1.375rem] font-extrabold leading-tight text-[var(--ink)]">
            {row.label}
          </h2>
        </div>
        <span
          className="severity-badge shrink-0"
          data-severity={row.isDefault ? 'info' : 'warning'}
        >
          {row.isDefault ? 'bawaan' : 'diubah'}
        </span>
      </header>

      <p className="kicker -mt-1 font-mono normal-case tracking-normal text-[var(--ink-faint)]">
        {row.code}
      </p>

      <p className="text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {row.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-4 pt-2">
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
                    className="h-3.5 w-3.5 text-[var(--accent-indigo-deep)]"
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
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
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
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
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
          <p className="max-w-xs text-[0.8125rem] text-[var(--accent-coral-deep)] lg:text-right">
            <AlertTriangle
              className="mr-1 inline h-3.5 w-3.5 -translate-y-px"
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
          zona prune
        </span>
        <h2 className="display-title mt-2 text-[1.75rem] font-extrabold leading-tight text-[var(--ink)]">
          Prune semua data
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
                className="h-3.5 w-3.5 text-[var(--accent-indigo-deep)]"
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
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Prune semua sekarang
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
          <p className="max-w-xs text-[0.8125rem] text-[var(--accent-coral-deep)] lg:text-right">
            <AlertTriangle
              className="mr-1 inline h-3.5 w-3.5 -translate-y-px"
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
