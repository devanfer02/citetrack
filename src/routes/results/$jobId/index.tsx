import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { Download, Search } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { STATUS_ORDER } from '#/lib/results/constants'
import { ResultsTable } from './-sections/results-table'

export const Route = createFileRoute('/results/$jobId/')({
  component: ResultsDashboard,
  loader: async ({ params }) => {
    const { getFullResults } = await import('#/services/export/results')
    return getFullResults({ data: { jobId: params.jobId } })
  },
})

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

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      const mod = await import('#/services/export/export')
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
    <main className="page-wrap w-full flex-1 px-4 pb-8 pt-14">
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

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[12.5rem]">
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

        <ResultsTable
          rows={filtered}
          expandedKeys={expandedKeys}
          onToggleExpand={toggleExpand}
        />

        <p className="mt-3 text-xs text-muted-foreground">
          Showing {filtered.length} of {data.traces.length} citations
        </p>
      </section>
    </main>
  )
}
