import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileQuestion,
  FileX,
  Search,
  AlertTriangle,
} from 'lucide-react'
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
import type { CitationTraceRow, ResultsSummary } from '#/services/results'

export const Route = createFileRoute('/results/$jobId')({
  component: ResultsDashboard,
  loader: async ({ params }) => {
    const { getFullResults } = await import('#/services/results')
    return getFullResults({ data: { jobId: params.jobId } })
  },
})

type SortKey = 'thesisPage' | 'confidence' | 'status'
type StatusFilter = 'all' | 'verified' | 'needs-review' | 'no-source' | 'not-found'

const STATUS_ORDER: Record<string, number> = {
  verified: 0,
  'needs-review': 1,
  'no-source': 2,
  'not-found': 3,
}

function StatusIcon({ status }: { status: CitationTraceRow['status'] }) {
  switch (status) {
    case 'verified':
      return <BookOpen className="h-4 w-4 text-accent-foreground" />
    case 'needs-review':
      return <AlertTriangle className="h-4 w-4 text-secondary-foreground" />
    case 'no-source':
      return <FileX className="h-4 w-4 text-destructive" />
    case 'not-found':
      return <FileQuestion className="h-4 w-4 text-muted-foreground" />
  }
}

function StatusBadge({ status }: { status: CitationTraceRow['status'] }) {
  switch (status) {
    case 'verified':
      return (
        <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
          Verified
        </Badge>
      )
    case 'needs-review':
      return (
        <Badge className="border-secondary/40 bg-secondary/20 text-secondary-foreground">
          Needs Review
        </Badge>
      )
    case 'no-source':
      return <Badge variant="destructive">No Source</Badge>
    case 'not-found':
      return <Badge variant="outline">Not Found</Badge>
  }
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <span className="text-xs text-muted-foreground">—</span>
  if (confidence >= 0.8) {
    return (
      <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
        {Math.round(confidence * 100)}%
      </Badge>
    )
  }
  if (confidence >= 0.5) {
    return (
      <Badge className="border-secondary/40 bg-secondary/20 text-secondary-foreground">
        {Math.round(confidence * 100)}%
      </Badge>
    )
  }
  return (
    <Badge variant="destructive">{Math.round(confidence * 100)}%</Badge>
  )
}

function ResultsDashboard() {
  const data = Route.useLoaderData() as ResultsSummary
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('thesisPage')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    let rows = data.traces

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.citationKey.toLowerCase().includes(q) ||
          r.thesisContext.toLowerCase().includes(q) ||
          r.referenceTitle?.toLowerCase().includes(q) ||
          r.matchedPassage?.toLowerCase().includes(q),
      )
    }

    return rows.toSorted((a, b) => {
      if (sortKey === 'thesisPage') return a.thesisPage - b.thesisPage
      if (sortKey === 'confidence')
        return (b.passageConfidence ?? -1) - (a.passageConfidence ?? -1)
      return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    })
  }, [data.traces, search, statusFilter, sortKey])

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      const mod = await import('#/services/export')
      const fn = format === 'csv' ? mod.exportCsv : mod.exportJson
      const result = await fn({ data: { jobId: data.jobId } })
      const blob = new Blob([result.content], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    },
    [data.jobId],
  )

  const statusCounts = useMemo(() => {
    const counts = { verified: 0, 'needs-review': 0, 'no-source': 0, 'not-found': 0 }
    for (const t of data.traces) counts[t.status]++
    return counts
  }, [data.traces])

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="rise-in mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="island-kicker mb-2">Results</p>
          <h1 className="display-title mb-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Citation Trace Report
          </h1>
          <p className="text-sm text-muted-foreground">{data.filename}</p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('json')}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="island-shell rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">Total Citations</p>
            <p className="text-2xl font-bold text-foreground">
              {data.totalCitations}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.uniqueCitations} unique
            </p>
          </div>
          <div className="island-shell rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">Passages Found</p>
            <p className="text-2xl font-bold text-foreground">
              {data.passagesFound}
            </p>
            <p className="text-xs text-muted-foreground">
              of {data.uniqueCitations}
            </p>
          </div>
          <div className="island-shell rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">Avg Confidence</p>
            <p className="text-2xl font-bold text-foreground">
              {data.avgConfidence > 0
                ? `${Math.round(data.avgConfidence * 100)}%`
                : '—'}
            </p>
          </div>
          <div className="island-shell rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge className="border-accent/20 bg-accent/10 text-accent-foreground text-xs">
                {statusCounts.verified}
              </Badge>
              <Badge className="border-secondary/40 bg-secondary/20 text-secondary-foreground text-xs">
                {statusCounts['needs-review']}
              </Badge>
              <Badge variant="destructive" className="text-xs">
                {statusCounts['no-source'] + statusCounts['not-found']}
              </Badge>
            </div>
          </div>
        </div>

        {/* Filters + sort */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search citations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'verified', 'needs-review', 'no-source', 'not-found'] as const).map(
              (s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                  className="text-xs capitalize"
                >
                  {s === 'all' ? 'All' : s.replace('-', ' ')}
                </Button>
              ),
            )}
          </div>
          <div className="flex gap-1">
            {(['thesisPage', 'confidence', 'status'] as const).map((k) => (
              <Button
                key={k}
                variant={sortKey === k ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSortKey(k)}
                className="text-xs"
              >
                {k === 'thesisPage' ? 'Page' : k === 'confidence' ? 'Confidence' : 'Status'}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-8" />
                <TableHead>Citation</TableHead>
                <TableHead className="w-16 text-center">Thesis</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-16 text-center">Page</TableHead>
                <TableHead className="w-24 text-center">Confidence</TableHead>
                <TableHead className="w-28 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const isExpanded = expandedKeys.has(row.citationKey)
                return (
                  <TableRow key={row.citationKey}>
                    <TableCell>
                      <button
                        onClick={() => toggleExpand(row.citationKey)}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusIcon status={row.status} />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleExpand(row.citationKey)}
                        className="text-left"
                      >
                        <span className="font-medium text-foreground">
                          {row.citationKey}
                        </span>
                        {isExpanded && (
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Thesis context (p.{row.thesisPage}):
                              </p>
                              <p className="text-xs text-foreground">
                                {row.thesisContext}
                              </p>
                            </div>
                            {row.matchedPassage && (
                              <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
                                <p className="mb-1 text-xs font-medium text-accent-foreground">
                                  Source passage (p.{row.sourcePage}):
                                </p>
                                <p className="text-xs text-foreground">
                                  {row.matchedPassage}
                                </p>
                              </div>
                            )}
                            {row.reasoning && (
                              <p className="text-xs italic text-muted-foreground">
                                {row.reasoning}
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {row.thesisPage}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {row.referenceTitle
                          ? row.referenceTitle.length > 40
                            ? `${row.referenceTitle.slice(0, 40)}...`
                            : row.referenceTitle
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {row.sourcePage ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <ConfidenceBadge confidence={row.passageConfidence} />
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No citations match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Showing {filtered.length} of {data.traces.length} citations
        </p>
      </section>
    </main>
  )
}
