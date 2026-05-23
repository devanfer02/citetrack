import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
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

export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings · CiteTrack' }] }),
})

function SettingsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['configurations'],
    queryFn: () => listConfigurations(),
  })

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16 pt-12 sm:px-8">
      <header className="mb-8">
        <p className="island-kicker mb-3 text-[var(--lagoon-deep)]">
          Admin · Settings
        </p>
        <h1 className="display-title text-4xl font-medium leading-[1.05] tracking-tight text-[var(--sea-ink)] sm:text-[2.75rem]">
          Konfigurasi pipeline.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
          Pengaturan runtime untuk pipeline auto-detect dan pengunggahan.
          Perubahan berlaku dalam 30 detik.
        </p>
        <div className="editorial-rule mt-6" />
      </header>

      <aside className="mb-10 grid grid-cols-[3.5rem_1fr] gap-x-5">
        <span
          aria-hidden
          className="marginalia-rule mt-1 h-[calc(100%-0.5rem)] w-px justify-self-end"
          data-severity="warning"
        />
        <div>
          <p className="small-caps pageref text-xs text-[var(--lagoon-deep)]">
            Halaman ini tidak terkunci
          </p>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
            Siapa pun yang memiliki akses ke host ini bisa mengubah nilai di
            bawah.{' '}
            <span className="italic text-[var(--sea-ink-soft)]">
              Ubah dengan hati-hati.
            </span>
          </p>
        </div>
      </aside>

      {isPending && (
        <p className="kicker dots-loop text-[var(--sea-ink-soft)]">
          Memuat konfigurasi<span>.</span>
          <span>.</span>
          <span>.</span>
        </p>
      )}

      {isError && (
        <aside className="grid grid-cols-[3.5rem_1fr] gap-x-5">
          <span
            aria-hidden
            className="marginalia-rule mt-1 h-[calc(100%-0.5rem)] w-px justify-self-end"
            data-severity="error"
          />
          <div>
            <p className="small-caps pageref text-xs text-[var(--destructive)]">
              Gagal memuat
            </p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-foreground">
              <AlertTriangle
                className="mr-1 inline h-4 w-4 -translate-y-px text-[var(--destructive)]"
                strokeWidth={1.75}
              />
              {error instanceof Error
                ? error.message
                : 'Tidak bisa memuat konfigurasi.'}
            </p>
          </div>
        </aside>
      )}

      {data && (
        <ol className="flex flex-col">
          {data.map((row, idx) => (
            <li key={row.code}>
              <ConfigurationRowItem row={row} idx={idx} />
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

function ConfigurationRowItem({
  row,
  idx,
}: {
  row: ConfigurationRow
  idx: number
}) {
  const queryClient = useQueryClient()

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
    <article className="grid grid-cols-[5rem_1fr] gap-x-5 border-t border-[var(--line)] py-6 first:border-t-0 first:pt-2">
      <aside className="flex flex-col items-end gap-1">
        <span className="kicker whitespace-nowrap tabular-nums text-foreground">
          №{String(idx + 1).padStart(2, '0')}
        </span>
        <span className="kicker whitespace-nowrap text-[var(--sea-ink-soft)]/70">
          {row.isDefault ? 'default' : 'diubah'}
        </span>
      </aside>

      <div className="min-w-0 pl-3 sm:pl-5">
        <h2 className="display-title text-xl font-medium leading-snug text-foreground sm:text-[1.375rem]">
          {row.label}
        </h2>
        <p className="kicker mt-1 text-[var(--sea-ink-soft)]/80">{row.code}</p>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
          {row.description}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className="mt-5 flex flex-col gap-3"
        >
          <form.Field
            name="value"
            validators={{
              onChange: ({ value }) => {
                const parsed = parseConfigFromDisplay(row.code, value)
                if (parsed === null) {
                  return unitLabel === 'seconds'
                    ? 'Harus berupa angka positif (mis. 30, 0.5, 3.4s)'
                    : 'Harus berupa bilangan bulat positif'
                }
                const result = CONFIG_SCHEMAS[row.code].safeParse(parsed)
                if (!result.success) {
                  return result.error.issues
                    .map((i) => i.message)
                    .join('; ')
                }
                return undefined
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`field-${row.code}`} className="sr-only">
                  {row.label}
                </Label>
                <div className="relative max-w-md">
                  <Input
                    id={`field-${row.code}`}
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                    className={`rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 font-mono text-[0.9375rem] tabular-nums shadow-none focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0 ${unitLabel ? 'pr-16' : ''}`}
                  />
                  {unitLabel && (
                    <span className="kicker pointer-events-none absolute inset-y-0 right-0 flex items-center text-[var(--sea-ink-soft)]">
                      {unitLabel}
                    </span>
                  )}
                </div>
                {field.state.meta.errors.length > 0 && (
                  <p className="text-[0.8125rem] text-[var(--destructive)]">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
                <p className="kicker text-[var(--sea-ink-soft)]/80">
                  default{' '}
                  <span className="font-mono normal-case tracking-normal text-foreground">
                    {formatConfigForDisplay(row.code, row.defaultValue)}
                  </span>
                  {unitLabel ? ` ${unitLabel}` : ''}
                  {unitLabel === 'seconds' && (
                    <>
                      {' · disimpan sebagai '}
                      <span className="font-mono normal-case tracking-normal text-foreground">
                        {row.defaultValue}
                      </span>{' '}
                      ms
                    </>
                  )}
                </p>
              </div>
            )}
          </form.Field>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  disabled={!canSubmit || mutation.isPending}
                  className="group inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-[0.9375rem] font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--sea-ink)] disabled:hover:text-[var(--sea-ink)]"
                >
                  {mutation.isPending
                    ? 'Menyimpan…'
                    : mutation.isSuccess && !isSubmitting
                      ? (
                          <>
                            <Check
                              className="h-3.5 w-3.5 translate-y-px text-[var(--palm)]"
                              strokeWidth={2}
                            />
                            Tersimpan
                          </>
                        )
                      : 'Simpan'}
                </button>
              )}
            </form.Subscribe>

            <button
              type="button"
              onClick={reset}
              disabled={row.isDefault || mutation.isPending}
              className="kicker inline-flex items-baseline gap-1 text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--sea-ink-soft)]"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
              kembali ke default
            </button>

            {mutation.isError && (
              <p className="text-[0.8125rem] text-[var(--destructive)]">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'Gagal menyimpan'}
              </p>
            )}
          </div>
        </form>
      </div>
    </article>
  )
}
