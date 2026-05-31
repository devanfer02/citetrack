import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Check, RotateCcw } from 'lucide-react'
import { Callout } from '#/components/Callout'
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
import {
  CONFIG_DISPLAY,
  CONFIG_ENUM_OPTIONS,
  CONFIG_SCHEMAS,
  CONFIG_UNIT_LABEL,
  CONFIG_WARNINGS,
  formatConfigForDisplay,
  parseConfigFromDisplay,
  type ConfigKey,
} from '#/lib/configurations'
import {
  type ConfigurationRow,
  updateConfiguration,
} from '#/services/configurations'
import { groupLabelForCode, toneForCode } from './shared'

export function ConfigCard({
  row,
  idx,
}: {
  row: ConfigurationRow
  idx: number
}) {
  return CONFIG_DISPLAY[row.code] === 'boolean' ? (
    <BooleanConfigurationCard row={row} idx={idx} />
  ) : (
    <ConfigurationCard row={row} idx={idx} />
  )
}

export function SettingWarning({ text }: { text: string }) {
  return <Callout severity="warning">{text}</Callout>
}

export function SettingCardHeader({
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

export function ConfigurationCard({
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

export function BooleanConfigurationCard({
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
