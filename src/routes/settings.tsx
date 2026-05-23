import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { AlertTriangle, Check, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { AccentInk } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { isLocalEnv } from '#/env'
import {
  CONFIG_SCHEMAS,
  CONFIG_UNIT_LABEL,
  formatConfigForDisplay,
  parseConfigFromDisplay,
  type ConfigKey,
} from '#/lib/configurations'
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

export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings · CiteTrack' }] }),
})

type CardTone = 'mint' | 'butter' | 'sky' | 'blush' | 'cream'

function toneForCode(code: ConfigKey): CardTone {
  if (code.startsWith('autofetch.')) return 'mint'
  if (code.startsWith('upload.')) return 'sky'
  if (code.startsWith('purge.')) return 'butter'
  return 'cream'
}

function groupLabelForCode(code: ConfigKey): string {
  if (code.startsWith('autofetch.')) return 'pencarian otomatis'
  if (code.startsWith('upload.')) return 'unggah'
  if (code.startsWith('purge.')) return 'pembersihan'
  return 'lainnya'
}

function SettingsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['configurations'],
    queryFn: () => listConfigurations(),
  })

  return (
    <main className="flex-1">
      <Section tone="mint" innerClassName="pb-12 pt-14">
        <span className="kicker text-[var(--accent-coral-deep)]">
          Admin · Setelan
        </span>
        <h1 className="display-title mt-3 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Atur cara kerja <AccentInk>sistem</AccentInk>.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Batas waktu pencarian sumber, ukuran unggahan maksimum, dan kapan
          riwayat dibersihkan. Perubahan terbaca paling lambat 30 detik
          setelah disimpan.
        </p>
        <UnlockNotice />
      </Section>

      <Section tone="cream" innerClassName="pb-20 pt-12">
        <div className="mx-auto w-full max-w-[80rem]">
          {isPending && (
            <p className="kicker dots-loop text-[var(--ink-soft)]">
              Memuat konfigurasi<span>.</span>
              <span>.</span>
              <span>.</span>
            </p>
          )}

          {isError && (
            <article className="soft-card flex items-start gap-3 p-5" data-tone="blush">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-coral-deep)]"
                strokeWidth={1.75}
              />
              <div>
                <p className="kicker text-[var(--accent-coral-deep)]">
                  Gagal memuat
                </p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-[var(--ink)]">
                  {error instanceof Error
                    ? error.message
                    : 'Tidak bisa memuat konfigurasi.'}
                </p>
              </div>
            </article>
          )}

          {data && (
            <ol className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {data.map((row, idx) => (
                <li key={row.code}>
                  <ConfigurationCard row={row} idx={idx} />
                </li>
              ))}
            </ol>
          )}

          <PurgeSection />
          <PruneAllSection />
        </div>
      </Section>
    </main>
  )
}

function UnlockNotice() {
  return (
    <div className="mt-6 inline-flex max-w-prose items-start gap-2.5 rounded-2xl border border-[color-mix(in_oklab,var(--marker-yellow)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-butter)_70%,#ffffff)] px-4 py-3">
      <Sparkles
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
                      {row.defaultValue}
                    </span>{' '}
                    ms
                  </>
                )}
                {unitLabel === 'MB' && (
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
