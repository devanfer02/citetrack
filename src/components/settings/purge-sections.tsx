import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  PRUNE_ALL_CONFIRMATION,
  pruneAll,
  purgeHistory,
  type PruneAllResult,
  type PurgeResult,
} from '#/services/purge'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export function PurgeSection() {
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

export function PruneAllSection() {
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
