import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Loader2, Search } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { isLocalEnv } from '#/env'
import { relativeTime } from '#/lib/history/utils'
import {
  listEvaluationComparisonCandidates,
  type EvaluationComparisonCandidate,
} from '#/services/evaluation/compare'

const candidatesQuery = (currentId: string) =>
  queryOptions({
    queryKey: ['evaluation-compare-candidates', currentId] as const,
    queryFn: () =>
      listEvaluationComparisonCandidates({ data: { currentId } }),
    staleTime: 30_000,
  })

export function ComparePicker({ currentEvalId }: { currentEvalId: string }) {
  const [open, setOpen] = useState(false)

  if (!isLocalEnv) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          <span>Bandingkan</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>Bandingkan dengan evaluasi lain</DialogTitle>
          <DialogDescription>
            Pilih satu laporan untuk membandingkan dengan laporan ini —
            lihat temuan yang sudah beres, yang masih ada, dan yang baru
            muncul.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CandidateList
            currentEvalId={currentEvalId}
            onPick={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CandidateList({
  currentEvalId,
  onPick,
}: {
  currentEvalId: string
  onPick: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { data, isPending, isError } = useQuery(
    candidatesQuery(currentEvalId),
  )

  const filtered = useMemo(() => {
    const items = data ?? []
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((c) => c.filename.toLowerCase().includes(q))
  }, [data, query])

  const goCompare = (otherId: string) => {
    onPick()
    void navigate({
      to: '/evaluation/compare/$beforeId/$afterId',
      params: { beforeId: otherId, afterId: currentEvalId },
    })
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[0.875rem] text-[var(--ink-soft)]">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        Memuat evaluasi…
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-10 text-center text-[0.875rem] text-[var(--ink-soft)]">
        Gagal memuat daftar evaluasi. Coba tutup dan buka lagi.
      </p>
    )
  }

  if ((data ?? []).length === 0) {
    return (
      <p className="py-10 text-center text-[0.875rem] text-[var(--ink-soft)]">
        Belum ada evaluasi lain yang selesai untuk dibandingkan.
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]"
          strokeWidth={1.75}
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama berkas…"
          aria-label="Cari evaluasi berdasarkan nama berkas"
          className="pl-9"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[0.875rem] text-[var(--ink-soft)]">
          Tidak ada berkas yang cocok dengan “{query.trim()}”.
        </p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
          {filtered.map((candidate) => (
            <li key={candidate.id}>
              <CandidateRow
                candidate={candidate}
                onSelect={() => goCompare(candidate.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  onSelect,
}: {
  candidate: EvaluationComparisonCandidate
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-4 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--accent-coral)]/60 hover:bg-[var(--bg-butter)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-semibold text-[var(--ink)] group-hover:text-[var(--accent-coral-deep)]">
          {candidate.filename}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-soft)]">
          {relativeTime(candidate.createdAt)}
          {candidate.totalPages !== null && (
            <>
              <span className="mx-1.5 text-[var(--ink-faint)]">•</span>
              {candidate.totalPages} hlm
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
        {candidate.overallScore !== null && (
          <span className="text-[0.9375rem] font-bold text-[var(--ink)]">
            {candidate.overallScore}
            <span className="ml-0.5 text-[0.625rem] font-medium tracking-wider text-[var(--ink-soft)]">
              NILAI
            </span>
          </span>
        )}
        {candidate.errorCount !== null && (
          <span className="text-[0.75rem] text-[var(--ink-soft)]">
            {candidate.errorCount} temuan
          </span>
        )}
      </div>
    </button>
  )
}
