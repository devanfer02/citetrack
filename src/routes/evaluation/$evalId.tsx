import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
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

function severityVariant(
  severity: Finding['severity'],
): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (severity === 'error') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
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
  const escape = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
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
      .map(escape)
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

function FindingsTable({
  findings,
  filter,
}: {
  findings: Finding[]
  filter: string
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
        {filter ? 'No findings match the filter.' : 'No issues in this category.'}
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
                <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
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
}: {
  category: Category
  findings: Finding[]
  filter: string
}) {
  const [open, setOpen] = useState(true)
  const categoryFindings = findings.filter((f) => f.category === category)
  const errors = categoryFindings.filter((f) => f.severity === 'error').length
  const warnings = categoryFindings.filter((f) => f.severity === 'warning').length

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
          {errors > 0 && <Badge variant="destructive">{errors} error</Badge>}
          {warnings > 0 && (
            <Badge variant="secondary">{warnings} warning</Badge>
          )}
          {errors === 0 && warnings === 0 && (
            <Badge variant="outline">0 issues</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--line)] px-5 py-4">
          <FindingsTable findings={categoryFindings} filter={filter} />
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
      return 2000
    },
  })

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
  const isAnalyzing = status === 'pending' || status === 'extracting' || status === 'analyzing'

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

      {isAnalyzing && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {status === 'extracting' && 'Extracting pages from PDF…'}
            {status === 'analyzing' && 'Running KBBI, EYD, and FILKOM checks…'}
            {status === 'pending' && 'Queued for analysis…'}
          </p>
        </div>
      )}

      {status === 'failed' && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
          <p className="text-sm font-medium text-destructive-foreground">
            Analysis failed: {job.error ?? 'unknown error'}
          </p>
        </div>
      )}

      {status === 'done' && summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">Overall Score</p>
            <p className="text-2xl font-semibold">{score ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">KBBI</p>
            <p className="text-2xl font-semibold">
              {summary.kbbiErrorCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">EYD</p>
            <p className="text-2xl font-semibold">
              {summary.eydErrorCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3">
            <p className="text-xs text-muted-foreground">FILKOM</p>
            <p className="text-2xl font-semibold">
              {summary.filkomErrorCount}
            </p>
          </div>
        </div>
      )}

      {status === 'done' && (
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

      {status === 'done' && (
        <div className="flex flex-col gap-4">
          <CategorySection category="kbbi" findings={findings} filter={filter} />
          <CategorySection category="eyd" findings={findings} filter={filter} />
          <CategorySection category="filkom" findings={findings} filter={filter} />
        </div>
      )}
    </main>
  )
}
