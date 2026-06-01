import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import { isEligible, isItalicFix } from '#/services/evaluation/apply/eligibility'
import type {
  ApplyResult,
  Finding,
} from '#/services/evaluation/apply/types'

type ApplyPanelProps = {
  evalJobId: string
  findings: readonly Finding[]
}

const CATEGORY_LABEL: Record<string, string> = {
  eyd: 'EYD',
  kbbi: 'KBBI',
}

type FormValues = {
  selectedIds: number[]
  docxFile: File | null
}

function findingLabel(f: Finding): string {
  const where = f.pageNumber == null ? 'Halaman ?' : `Hal. ${f.pageNumber}`
  const rule = f.ruleId ?? CATEGORY_LABEL[f.category] ?? f.category
  return `${where} · ${rule}`
}

export function ApplyPanel({ evalJobId, findings }: ApplyPanelProps) {
  const queryClient = useQueryClient()
  const eligible = findings.filter(isEligible)
  const eydEligible = eligible.filter(
    (f) => f.category === 'eyd' && !isItalicFix(f),
  )
  const kbbiEligible = eligible.filter((f) => f.category === 'kbbi')
  const italicEligible = eligible.filter(isItalicFix)

  const applyMutation = useMutation({
    mutationFn: async (vars: FormValues): Promise<ApplyResult> => {
      const fd = new FormData()
      fd.append('evalJobId', evalJobId)
      fd.append('findingIds', JSON.stringify(vars.selectedIds))
      if (vars.docxFile) fd.append('docx', vars.docxFile)
      const { applyEvaluationFixes } = await import(
        '#/services/evaluation/apply'
      )
      return applyEvaluationFixes({ data: fd })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['evaluation-report', evalJobId],
      }),
  })

  const form = useForm({
    defaultValues: {
      selectedIds: eydEligible.map((f) => f.id),
      docxFile: null,
    } as FormValues,
    onSubmit: ({ value }) => {
      if (value.selectedIds.length === 0) return
      applyMutation.mutate(value)
    },
  })

  if (eligible.length === 0) {
    return (
      <p className="py-6 text-sm leading-relaxed text-[var(--ink-soft)]">
        Belum ada temuan dengan saran otomatis yang bisa diterapkan. Temuan
        tanpa saran perbaikan perlu kamu tinjau sendiri.
      </p>
    )
  }

  const toggle = (id: number) =>
    form.setFieldValue('selectedIds', (prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const setGroup = (ids: number[], checked: boolean) =>
    form.setFieldValue('selectedIds', (prev) => {
      const set = new Set(prev)
      for (const id of ids) {
        if (checked) set.add(id)
        else set.delete(id)
      }
      return [...set]
    })

  const renderGroup = (
    title: string,
    note: string,
    rows: Finding[],
    selectedIds: number[],
    italic = false,
  ) => {
    if (rows.length === 0) return null
    const ids = rows.map((f) => f.id)
    const allChecked = ids.every((id) => selectedIds.includes(id))
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="kicker text-[var(--ink-soft)]">
            {title} · {rows.length}
          </h3>
          <button
            type="button"
            className="text-xs text-[var(--accent-indigo)] underline-offset-2 hover:underline"
            onClick={() => setGroup(ids, !allChecked)}
          >
            {allChecked ? 'Hapus semua' : 'Pilih semua'}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-[var(--ink-faint)]">{note}</p>
        <ul className="flex flex-col gap-2">
          {rows.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-[var(--bg-cream)]">
                <input
                  type="checkbox"
                  aria-label={
                    italic
                      ? `Jadikan miring: ${f.token}`
                      : `Terapkan: ${f.token} menjadi ${f.suggestion}`
                  }
                  checked={selectedIds.includes(f.id)}
                  onChange={() => toggle(f.id)}
                  className="mt-1 size-4 shrink-0 accent-[var(--accent-coral)]"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="kicker text-[var(--ink-faint)]">
                    {findingLabel(f)}
                  </span>
                  {italic ? (
                    <span className="text-sm leading-relaxed text-[var(--ink)]">
                      <span className="italic">{f.token}</span>{' '}
                      <span className="text-[var(--ink-soft)]">
                        → jadikan miring
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm leading-relaxed text-[var(--ink)]">
                      <span className="line-through decoration-[var(--ink-faint)]">
                        {f.token}
                      </span>{' '}
                      <span aria-hidden>→</span>{' '}
                      <span className="font-medium text-[var(--accent-coral-deep)]">
                        {f.suggestion}
                      </span>
                    </span>
                  )}
                  <span className="text-xs leading-relaxed text-[var(--ink-soft)]">
                    {f.message}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.Subscribe selector={(s) => s.values.selectedIds}>
          {(selectedIds) => (
            <div className="flex max-h-[45vh] flex-col gap-6 overflow-y-auto pr-1">
              {renderGroup(
                'Perbaikan EYD',
                'Perbaikan ejaan dan tanda baca yang pasti. Dicentang otomatis.',
                eydEligible,
                selectedIds,
              )}
              {renderGroup(
                'Saran KBBI',
                'Saran ejaan kata. Periksa dulu sebelum mencentang — sebagian bisa keliru.',
                kbbiEligible,
                selectedIds,
              )}
              {renderGroup(
                'Jadikan miring',
                'Istilah asing yang sebaiknya dicetak miring. Hanya diterapkan saat menyusun ulang .docx (tanpa unggah berkas asli); kalau kamu unggah .docx, kata-kata ini cuma didaftar untuk kamu miringkan sendiri.',
                italicEligible,
                selectedIds,
                true,
              )}
            </div>
          )}
        </form.Subscribe>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="apply-docx"
            className="kicker text-[var(--ink-soft)]"
          >
            Berkas .docx asli (opsional)
          </label>
          <input
            id="apply-docx"
            type="file"
            accept=".docx"
            aria-label="Unggah berkas .docx asli"
            onChange={(e) =>
              form.setFieldValue('docxFile', e.target.files?.[0] ?? null)
            }
            className="text-sm text-[var(--ink-soft)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--bg-sky)] file:px-4 file:py-2 file:text-[var(--ink)]"
          />
        </div>

        <form.Subscribe selector={(s) => s.values.selectedIds.length}>
          {(count) => (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={count === 0 || applyMutation.isPending}>
                {applyMutation.isPending
                  ? 'Menerapkan…'
                  : `Terapkan ${count} perbaikan`}
              </Button>
              {count === 0 && (
                <span className="text-xs text-[var(--ink-faint)]">
                  Pilih minimal satu perbaikan.
                </span>
              )}
            </div>
          )}
        </form.Subscribe>
      </form>

      {applyMutation.isError && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[var(--bg-blush)] p-3 text-sm text-[var(--ink)]"
          data-severity="error"
        >
          Gagal menerapkan perbaikan:{' '}
          {applyMutation.error instanceof Error
            ? applyMutation.error.message
            : 'kesalahan tidak diketahui'}
        </p>
      )}

      {applyMutation.data && (
        <ApplyResultView evalJobId={evalJobId} result={applyMutation.data} />
      )}
    </div>
  )
}

function ApplyResultView({
  evalJobId,
  result,
}: {
  evalJobId: string
  result: ApplyResult
}) {
  const { applied, unlocated } = result.changeLog
  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[var(--ink)]">
          {applied.length} perbaikan diterapkan
          {unlocated.length > 0
            ? `, ${unlocated.length} tidak dapat diterapkan`
            : ''}
          .
        </p>
        <a
          href={`/api/evaluation-applied/${evalJobId}`}
          className="inline-flex items-center rounded-full bg-[var(--accent-coral)] px-4 py-2 text-sm font-medium text-white no-underline hover:bg-[var(--accent-coral-deep)]"
        >
          Unduh .docx
        </a>
        <a
          href={`/api/evaluation-applied/${evalJobId}?file=log`}
          className="text-sm text-[var(--accent-indigo)] underline-offset-2 hover:underline"
        >
          Unduh ringkasan perubahan
        </a>
      </div>

      {unlocated.length > 0 && (
        <div
          className="rounded-lg bg-[var(--bg-butter)] p-4"
          data-severity="warning"
        >
          <p className="text-sm font-medium text-[var(--ink)]">
            Tidak ditemukan di dokumen — periksa manual:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {unlocated.map((e) => (
              <li
                key={e.findingId}
                className="text-sm leading-relaxed text-[var(--ink-soft)]"
              >
                {e.pageNumber == null ? 'Hal. ?' : `Hal. ${e.pageNumber}`}:{' '}
                <span className="text-[var(--ink)]">{e.token}</span> →{' '}
                <span className="text-[var(--ink)]">{e.suggestion}</span>{' '}
                <span className="text-[var(--ink-faint)]">({e.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
