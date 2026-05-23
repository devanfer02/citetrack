import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { ArrowDownToLine } from 'lucide-react'
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

const STATUS_LABEL: Record<CitationTraceRow['status'], string> = {
  verified: 'terverifikasi',
  'needs-review': 'perlu ditinjau',
  'no-source': 'tanpa sumber',
  'not-found': 'tidak ditemukan',
}

const STATUS_SEVERITY: Record<
  CitationTraceRow['status'],
  'info' | 'warning' | 'error'
> = {
  verified: 'info',
  'needs-review': 'warning',
  'no-source': 'error',
  'not-found': 'error',
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
    const counts = {
      verified: 0,
      'needs-review': 0,
      'no-source': 0,
      'not-found': 0,
    }
    for (const t of data.traces) counts[t.status]++
    return counts
  }, [data.traces])

  return (
    <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 pb-12 pt-10 sm:px-10">
      <header className="mb-8">
        <p className="island-kicker mb-3 text-[var(--lagoon-deep)]">
          Citation Tracer · Results
        </p>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="display-title text-4xl font-medium leading-[1.05] tracking-tight text-[var(--sea-ink)] sm:text-5xl">
              Citation Trace Report
            </h1>
            <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
              <span className="display-title italic text-[var(--sea-ink)]">
                “{data.filename}”
              </span>
              <span className="mx-2 text-[var(--sea-ink-soft)]/40">·</span>
              <span className="tabular-nums text-foreground">
                {data.totalCitations}
              </span>{' '}
              sitasi dari{' '}
              <span className="tabular-nums text-foreground">
                {data.uniqueCitations}
              </span>{' '}
              sumber unik
            </p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 self-start">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="group inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)]/40 pb-1 text-sm font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
            >
              <span>Unduh laporan</span>
              <ArrowDownToLine
                className="h-3.5 w-3.5 -translate-y-px transition-transform group-hover:translate-y-0"
                strokeWidth={1.75}
              />
              <span className="kicker text-[var(--sea-ink-soft)]">csv</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('json')}
              className="kicker text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--lagoon-deep)]"
            >
              atau json
            </button>
          </div>
        </div>
        <div className="editorial-rule mt-6" />
      </header>

      <section
        aria-label="Ringkasan"
        className="mb-10 grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4"
      >
        <Ledger
          kicker="Total sitasi"
          value={data.totalCitations}
          unit={`${data.uniqueCitations} unik`}
        />
        <Ledger
          kicker="Kalimat ditemukan"
          value={data.passagesFound}
          unit={`dari ${data.uniqueCitations}`}
        />
        <Ledger
          kicker="Rerata keyakinan"
          value={data.avgConfidence > 0
            ? `${Math.round(data.avgConfidence * 100)}%`
            : '—'}
        />
        <div>
          <p className="kicker mb-2 text-[var(--sea-ink-soft)]">Status</p>
          <div className="flex flex-col gap-1.5 text-[0.8125rem] text-[var(--sea-ink-soft)]">
            <StatusLine
              label="terverifikasi"
              count={statusCounts.verified}
              severity="info"
            />
            <StatusLine
              label="perlu ditinjau"
              count={statusCounts['needs-review']}
              severity="warning"
            />
            <StatusLine
              label="tanpa sumber"
              count={
                statusCounts['no-source'] + statusCounts['not-found']
              }
              severity="error"
            />
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-3">
        <span className="island-kicker text-[var(--sea-ink-soft)]">Filter</span>
        <Input
          placeholder="Cari sitasi, judul, atau kalimat…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 text-sm shadow-none focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-baseline gap-x-3">
          {(
            ['all', 'verified', 'needs-review', 'no-source', 'not-found'] as const
          ).map((s) => (
            <FilterPill
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              severity={s === 'all' ? undefined : STATUS_SEVERITY[s]}
            >
              {s === 'all' ? 'semua' : STATUS_LABEL[s]}
            </FilterPill>
          ))}
        </div>
        <span className="kicker ml-auto text-[var(--sea-ink-soft)]/70">
          urut
        </span>
        <div className="flex flex-wrap items-baseline gap-x-3">
          {(['thesisPage', 'confidence', 'status'] as const).map((k) => (
            <FilterPill
              key={k}
              active={sortKey === k}
              onClick={() => setSortKey(k)}
            >
              {k === 'thesisPage'
                ? 'halaman'
                : k === 'confidence'
                  ? 'keyakinan'
                  : 'status'}
            </FilterPill>
          ))}
        </div>
      </div>

      <ResultsTable
        rows={filtered}
        expandedKeys={expandedKeys}
        onToggleExpand={toggleExpand}
      />

      <p className="kicker mt-5 text-[var(--sea-ink-soft)]">
        Menampilkan{' '}
        <span className="tabular-nums text-foreground">{filtered.length}</span>{' '}
        dari{' '}
        <span className="tabular-nums text-foreground">
          {data.traces.length}
        </span>{' '}
        sitasi
      </p>
    </main>
  )
}

function Ledger({
  kicker,
  value,
  unit,
}: {
  kicker: string
  value: string | number
  unit?: string
}) {
  return (
    <div>
      <p className="kicker mb-1 text-[var(--sea-ink-soft)]">{kicker}</p>
      <p className="display-title text-[2rem] font-medium leading-none tracking-tight text-[var(--sea-ink)] tabular-nums">
        {value}
      </p>
      {unit && (
        <p className="kicker mt-1.5 text-[var(--sea-ink-soft)]/80">{unit}</p>
      )}
    </div>
  )
}

function StatusLine({
  label,
  count,
  severity,
}: {
  label: string
  count: number
  severity: 'error' | 'warning' | 'info'
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className="severity-dot translate-y-[1px]"
        data-severity={severity}
      />
      <span className="tabular-nums text-foreground">{count}</span>{' '}
      <span className="kicker">{label}</span>
    </span>
  )
}

function FilterPill({
  active,
  onClick,
  severity,
  children,
}: {
  active: boolean
  onClick: () => void
  severity?: 'error' | 'warning' | 'info'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kicker inline-flex items-baseline gap-1.5 border-b pb-1 transition-colors ${
        active
          ? 'border-[var(--sea-ink)] text-foreground'
          : 'border-transparent text-[var(--sea-ink-soft)] hover:text-foreground'
      }`}
    >
      {severity && (
        <span
          className="severity-dot translate-y-[1px]"
          data-severity={severity}
        />
      )}
      {children}
    </button>
  )
}
