import { createFileRoute, notFound } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useState, useMemo, useCallback } from 'react'
import { ArrowDownToLine, Check, Share2 } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Squiggle } from '#/components/doodles'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { STATUS_ORDER } from '#/lib/results/constants'
import { resultsSearchSchema } from '#/schemas/results'
import { ResultsTable } from './-sections/results-table'

export const Route = createFileRoute('/results/$jobId/')({
  component: ResultsDashboard,
  validateSearch: zodValidator(resultsSearchSchema),
  loader: async ({ params }) => {
    const { getFullResults } = await import('#/services/export/results')
    try {
      return await getFullResults({ data: { jobId: params.jobId } })
    } catch (err) {
      if (err instanceof Error && /job not found/i.test(err.message)) {
        throw notFound()
      }
      throw err
    }
  },
  head: ({ loaderData }) => {
    const filename = loaderData?.filename
      ? loaderData.filename.replace(/\.pdf$/i, '')
      : null
    const title = filename
      ? `${filename} · Citation Trace · CiteTrack`
      : 'Citation Trace Report · CiteTrack'
    return {
      meta: [
        { title },
        {
          name: 'description',
          content:
            'Hasil pelacakan sitasi: status verifikasi, kalimat yang cocok di paper sumber, dan ringkasan keseluruhan.',
        },
      ],
    }
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
  const { view } = Route.useSearch()
  const isShareMode = view === 'share'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('thesisPage')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [shareCopied, setShareCopied] = useState(false)

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

  const handleCopyShareLink = useCallback(async () => {
    if (typeof window === 'undefined') return
    const shareUrl = `${window.location.origin}/results/${data.jobId}?view=share`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setShareCopied(false)
    }
  }, [data.jobId])

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
    <main className="flex-1">
      {isShareMode && (
        <style>{`#app-header,#app-footer{display:none !important}`}</style>
      )}
      {isShareMode && (
        <div className="border-b border-[var(--line)] bg-[var(--bg-cream)] px-6 py-3 sm:px-10">
          <p className="kicker mx-auto max-w-[88rem] text-[var(--ink-soft)]">
            <span className="text-[var(--accent-coral-deep)]">
              CiteTrack · Laporan hanya-baca
            </span>{' '}
            <span className="text-[var(--ink-faint)]">
              · tautan ini bisa dibuka oleh siapa pun yang menerimanya
            </span>
          </p>
        </div>
      )}
      <Section tone="butter" grid innerClassName="relative pb-10 pt-14">
        <Squiggle
          tone="coral"
          size={48}
          className="absolute right-[8%] top-8 hidden md:block"
        />
        <span className="kicker text-[var(--accent-coral-deep)]">
          Citation Tracer · Hasil
        </span>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="display-title text-[clamp(2.25rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
              Citation <AccentInk>Trace</AccentInk> Report
            </h1>
            <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              <Marker tone="yellow">{data.filename}</Marker>
              <span className="mx-2 text-[var(--ink-faint)]">·</span>
              <span className="tabular-nums font-semibold text-[var(--ink)]">
                {data.totalCitations}
              </span>{' '}
              sitasi dari{' '}
              <span className="tabular-nums font-semibold text-[var(--ink)]">
                {data.uniqueCitations}
              </span>{' '}
              sumber unik
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start">
            {!isShareMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
                aria-label="Salin tautan hanya-baca"
              >
                {shareCopied ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {shareCopied ? 'Tertaut tersalin' : 'Bagikan tautan'}
              </Button>
            )}
            <Button type="button" onClick={() => handleExport('csv')} size="sm">
              <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={2} />
              Unduh CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('json')}
            >
              JSON
            </Button>
          </div>
        </div>
      </Section>

      <div className="mx-auto w-full max-w-[88rem] flex-1 px-6 pb-12 pt-10 sm:px-10">

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

      <p className="kicker mt-5 text-[var(--ink-soft)]">
        Menampilkan{' '}
        <span className="tabular-nums text-foreground">{filtered.length}</span>{' '}
        dari{' '}
        <span className="tabular-nums text-foreground">
          {data.traces.length}
        </span>{' '}
        sitasi
      </p>
      </div>
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
