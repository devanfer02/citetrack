import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  FileCheck2,
  FileText,
  Lightbulb,
  Loader2,
  SpellCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Progress } from '#/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  getEvaluationReport,
  type EvaluationReport,
} from '#/services/evaluation/report'

export const Route = createFileRoute('/evaluation/$evalId')({
  component: EvaluationReportPage,
})

type Category = 'kbbi' | 'eyd' | 'filkom'
type Finding = EvaluationReport['findings'][number]
type Job = EvaluationReport['job']

const CATEGORY_LABELS: Record<Category, string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
  filkom: 'FILKOM Template',
}

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  kbbi: 'Kata yang tidak ditemukan di Kamus Besar Bahasa Indonesia',
  eyd: 'Pelanggaran aturan ejaan yang disempurnakan',
  filkom: 'Struktur dokumen terhadap template skripsi FILKOM v3.0',
}

const EYD_TIPS = [
  '"Di mana" ditulis terpisah. "dimana" adalah kesalahan umum.',
  'Partikel "-lah" selalu serangkai: "bacalah", bukan "baca lah".',
  '"Daripada" ditulis serangkai, bukan "dari pada".',
  '"Kepada" satu kata; "ke pada" keliru.',
  'Kata depan di, ke, dari berdiri sendiri sebagai penunjuk tempat: "di kantor".',
  'Imbuhan "di-" serangkai untuk verba: "dibaca", "ditulis".',
  'Huruf kapital awal kalimat + nama diri; bukan untuk nama jenis: "pisang ambon".',
  'Istilah asing yang belum diserap ditulis miring.',
  '"Ke mana" dua kata, "kemana" adalah kesalahan.',
  'Tanda hubung "-" bukan tanda pisah "—". Pakai em-dash untuk sisipan.',
] as const

type Stage = {
  id: 'extract' | 'filkom' | 'kbbi' | 'eyd'
  label: string
  description: string
  icon: typeof FileCheck2
}

const STAGES: Stage[] = [
  {
    id: 'extract',
    label: 'Extract',
    description: 'Mengambil teks PDF',
    icon: FileText,
  },
  {
    id: 'filkom',
    label: 'FILKOM',
    description: 'Struktur template',
    icon: FileCheck2,
  },
  {
    id: 'kbbi',
    label: 'KBBI',
    description: 'Pemeriksaan ejaan',
    icon: BookOpen,
  },
  { id: 'eyd', label: 'EYD', description: 'Aturan ejaan', icon: SpellCheck },
]

function severityVariant(
  severity: Finding['severity'],
): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (severity === 'error') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
}

const KBBI_PROGRESS_SCALE = 100

function stageState(
  job: Job,
  stage: Stage['id'],
): 'waiting' | 'running' | 'done' {
  if (stage === 'extract') {
    if (job.status === 'pending') return 'waiting'
    if (job.status === 'extracting') return 'running'
    return 'done'
  }
  if (stage === 'filkom') {
    if (job.filkomDone) return 'done'
    if (job.currentStep === 'filkom') return 'running'
    return 'waiting'
  }
  if (stage === 'kbbi') {
    if (
      job.kbbiTotal > 0 &&
      job.kbbiProgress >= job.kbbiTotal &&
      job.currentStep !== 'kbbi'
    ) {
      return 'done'
    }
    if (job.currentStep === 'kbbi') return 'running'
    if (job.currentStep === 'eyd' || job.status === 'done') return 'done'
    return 'waiting'
  }
  if (job.currentStep === 'eyd') return 'running'
  if (job.status === 'done') return 'done'
  return 'waiting'
}

function stageProgress(job: Job, stage: Stage['id']): {
  processed: number
  total: number
  pct: number
} | null {
  if (stage === 'extract' && job.totalPages && job.totalPages > 0) {
    return {
      processed: job.extractedPages,
      total: job.totalPages,
      pct: Math.round((job.extractedPages / Math.max(job.totalPages, 1)) * 100),
    }
  }
  if (stage === 'kbbi' && job.kbbiTotal > 0) {
    const pageTotal = Math.max(1, Math.round(job.kbbiTotal / KBBI_PROGRESS_SCALE))
    const pageDone = Math.min(
      pageTotal,
      Math.ceil(job.kbbiProgress / KBBI_PROGRESS_SCALE),
    )
    return {
      processed: pageDone,
      total: pageTotal,
      pct: Math.min(100, Math.round((job.kbbiProgress / job.kbbiTotal) * 100)),
    }
  }
  if (stage === 'eyd' && job.eydTotal > 0) {
    return {
      processed: job.eydProgress,
      total: job.eydTotal,
      pct: Math.round((job.eydProgress / Math.max(job.eydTotal, 1)) * 100),
    }
  }
  return null
}

function PipelineCard({ job }: { job: Job }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STAGES.map((stage) => {
        const state = stageState(job, stage.id)
        const progress = stageProgress(job, stage.id)
        const Icon = stage.icon
        const pct = progress
          ? progress.pct
          : state === 'done'
            ? 100
            : 0

        return (
          <div
            key={stage.id}
            className={`relative overflow-hidden rounded-xl border px-4 py-4 transition-all ${
              state === 'running'
                ? 'border-primary/40 bg-primary/5 shadow-[0_0_0_3px_rgba(86,198,190,0.08)]'
                : state === 'done'
                  ? 'border-[var(--line)] bg-[var(--chip-bg)]'
                  : 'border-[var(--line)] bg-[var(--chip-bg)]/60 opacity-70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  state === 'done'
                    ? 'bg-accent/15 text-accent-foreground'
                    : state === 'running'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : state === 'running' ? (
                  <Icon className="h-5 w-5 animate-pulse" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  {stage.label}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {stage.description}
                </p>
              </div>
            </div>
            {(state === 'running' || progress) && (
              <div className="mt-3 space-y-1">
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? `Halaman ${progress.processed} dari ${progress.total}`
                    : state === 'running'
                      ? 'Memulai…'
                      : 'Selesai'}
                </p>
              </div>
            )}
            {state === 'done' && !progress && (
              <p className="mt-3 text-xs text-muted-foreground">Selesai</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EydTipBanner() {
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * EYD_TIPS.length),
  )

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % EYD_TIPS.length),
      5000,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--foam)]/40 px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lagoon)]" />
      <p
        key={index}
        className="text-sm text-foreground transition-opacity duration-500"
      >
        <span className="font-medium text-muted-foreground">
          Tahukah kamu?{' '}
        </span>
        {EYD_TIPS[index]}
      </p>
    </div>
  )
}

function downloadCsv(findings: Finding[], filename: string) {
  const header = [
    'category',
    'severity',
    'page',
    'rule_id',
    'message',
    'excerpt',
    'suggestion',
  ]
  const rows = findings.map((f) =>
    [
      f.category,
      f.severity,
      f.pageNumber,
      f.ruleId,
      f.message,
      f.excerpt,
      f.suggestion,
    ]
      .map(csvEscape)
      .join(','),
  )
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function FindingsTable({
  findings,
  filter,
  isLive,
}: {
  findings: Finding[]
  filter: string
  isLive: boolean
}) {
  const filtered = useMemo(() => {
    if (!filter.trim()) return findings
    const q = filter.toLowerCase()
    return findings.filter(
      (f) =>
        f.message.toLowerCase().includes(q) ||
        (f.excerpt?.toLowerCase().includes(q) ?? false) ||
        (f.ruleId?.toLowerCase().includes(q) ?? false),
    )
  }, [findings, filter])

  if (!filtered.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {filter
          ? 'No findings match the filter.'
          : isLive
            ? 'Mencari temuan…'
            : 'No issues in this category.'}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Page</TableHead>
            <TableHead className="w-24">Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Excerpt</TableHead>
            <TableHead>Suggestion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-xs">
                {f.pageNumber ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant={severityVariant(f.severity)}>
                  {f.severity}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{f.message}</TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">
                {f.excerpt ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                {f.suggestion ? (
                  <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5">
                    {f.suggestion}
                  </code>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CategorySection({
  category,
  findings,
  filter,
  isLive,
  liveCount,
}: {
  category: Category
  findings: Finding[]
  filter: string
  isLive: boolean
  liveCount: number | null
}) {
  const [open, setOpen] = useState(true)
  const categoryFindings = findings.filter((f) => f.category === category)
  const errors = categoryFindings.filter((f) => f.severity === 'error').length
  const warnings = categoryFindings.filter(
    (f) => f.severity === 'warning',
  ).length

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-lg font-semibold">{CATEGORY_LABELS[category]}</h2>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_DESCRIPTIONS[category]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && liveCount !== null && liveCount > 0 && (
            <Badge variant="outline" className="animate-pulse">
              {liveCount} so far
            </Badge>
          )}
          {errors > 0 && <Badge variant="destructive">{errors} error</Badge>}
          {warnings > 0 && (
            <Badge variant="secondary">{warnings} warning</Badge>
          )}
          {errors === 0 && warnings === 0 && !isLive && (
            <Badge variant="outline">0 issues</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--line)] px-5 py-4">
          <FindingsTable
            findings={categoryFindings}
            filter={filter}
            isLive={isLive}
          />
        </div>
      )}
    </section>
  )
}

function EvaluationReportPage() {
  const { evalId } = Route.useParams()
  const [filter, setFilter] = useState('')

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['evaluation-report', evalId],
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status
      if (status === 'done' || status === 'failed') return false
      return 1500
    },
  })

  const liveCounts = useMemo(() => {
    if (!data) return null
    const { job, findings } = data
    const status = job.status
    const running =
      status === 'pending' || status === 'extracting' || status === 'analyzing'
    if (!running) return null
    const current = job.currentStep
    const counts = { kbbi: 0, eyd: 0, filkom: 0 }
    for (const f of findings) counts[f.category]++
    return {
      kbbi:
        current === 'kbbi' || (current === 'eyd' && job.kbbiTotal > 0)
          ? counts.kbbi
          : null,
      eyd: current === 'eyd' ? counts.eyd : null,
      filkom: job.filkomDone ? counts.filkom : null,
    }
  }, [data])

  if (isPending) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading evaluation…</p>
        </div>
      </main>
    )
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load evaluation.'}
        </p>
      </main>
    )
  }

  const { job, summary, findings } = data
  const status = job.status
  const score = summary?.overallScore ?? null
  const isRunning =
    status === 'pending' || status === 'extracting' || status === 'analyzing'
  const isDone = status === 'done'

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-8">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="display-title text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Evaluation Report
        </h1>
        <p className="text-sm text-muted-foreground">
          <span className="truncate font-mono text-xs">{job.filename}</span>
          {' · '}
          {job.totalPages ?? '?'} pages
        </p>
      </header>

      {isRunning && (
        <div className="mb-6 flex flex-col gap-4">
          <PipelineCard job={job} />
          <EydTipBanner />
        </div>
      )}

      {status === 'failed' && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
          <p className="text-sm font-medium text-destructive-foreground">
            Analysis failed: {job.error ?? 'unknown error'}
          </p>
        </div>
      )}

      {isDone && summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">Overall Score</p>
            <p className="text-2xl font-semibold">{score ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">KBBI</p>
            <p className="text-2xl font-semibold">{summary.kbbiErrorCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">EYD</p>
            <p className="text-2xl font-semibold">{summary.eydErrorCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">FILKOM</p>
            <p className="text-2xl font-semibold">{summary.filkomErrorCount}</p>
          </div>
        </div>
      )}

      {isDone && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Filter by message, excerpt, or rule…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(findings, `evaluation-${evalId}.csv`)}
            disabled={findings.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      )}

      {(isRunning || isDone) && (
        <div className="flex flex-col gap-4">
          <CategorySection
            category="filkom"
            findings={findings}
            filter={filter}
            isLive={isRunning}
            liveCount={liveCounts?.filkom ?? null}
          />
          <CategorySection
            category="kbbi"
            findings={findings}
            filter={filter}
            isLive={isRunning}
            liveCount={liveCounts?.kbbi ?? null}
          />
          <CategorySection
            category="eyd"
            findings={findings}
            filter={filter}
            isLive={isRunning}
            liveCount={liveCounts?.eyd ?? null}
          />
        </div>
      )}
    </main>
  )
}
