import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { AccentInk } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  Arrow,
  DottedArc,
  PaperPlane,
  Sparkles,
  Squiggle,
  StarBurst,
  Underline,
} from '#/components/doodles'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import {
  getApiCallLog,
  listApiCallLogs,
} from '#/services/logs/api-logs'
import {
  API_PROVIDERS,
  type ApiProvider,
} from '#/services/logs/providers'

export const Route = createFileRoute('/admin/api-logs')({
  component: ApiLogsPage,
  head: () => ({ meta: [{ title: 'API logs · CiteTrack' }] }),
  loader: () =>
    listApiCallLogs({ data: { outcome: 'all', limit: PAGE_SIZE } }),
})

type OutcomeFilter = 'all' | 'errors' | 'success'

interface Filters {
  providers: Set<ApiProvider>
  outcome: OutcomeFilter
  trackJobId: string
  evalJobId: string
}

const PAGE_SIZE = 50

function ApiLogsPage() {
  const initialPage = Route.useLoaderData()
  const [filters, setFilters] = useState<Filters>({
    providers: new Set(),
    outcome: 'all',
    trackJobId: '',
    evalJobId: '',
  })

  const queryArgs = useMemo(
    () => ({
      provider:
        filters.providers.size > 0 ? [...filters.providers] : undefined,
      outcome: filters.outcome,
      trackJobId:
        filters.trackJobId.trim().length > 0
          ? filters.trackJobId.trim()
          : undefined,
      evalJobId:
        filters.evalJobId.trim().length > 0
          ? filters.evalJobId.trim()
          : undefined,
      limit: PAGE_SIZE,
    }),
    [filters],
  )

  // Seed the first page from the SSR loader so the table renders without
  // waiting for a client-side queryFn round-trip. Subsequent pages and
  // filter changes still go through useInfiniteQuery as normal.
  const isDefaultFilters =
    filters.providers.size === 0 &&
    filters.outcome === 'all' &&
    filters.trackJobId === '' &&
    filters.evalJobId === ''
  const query = useInfiniteQuery({
    queryKey: ['api-logs', queryArgs],
    initialPageParam: undefined as
      | { createdAt: string; id: number }
      | undefined,
    queryFn: ({ pageParam }) =>
      listApiCallLogs({ data: { ...queryArgs, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...(isDefaultFilters
      ? {
          initialData: { pages: [initialPage], pageParams: [undefined] },
          initialDataUpdatedAt: Date.now(),
          staleTime: 30_000,
        }
      : {}),
  })

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.rows) ?? [],
    [query.data],
  )

  return (
    <main className="flex-1">
      <Section tone="mint" grid innerClassName="relative pb-10 pt-14">
        <Sparkles
          tone="indigo"
          size={42}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <DottedArc
          tone="coral"
          size={120}
          className="absolute right-[12%] top-[7rem] hidden lg:block"
        />
        <PaperPlane
          tone="coral"
          size={32}
          className="absolute right-[6%] top-[10rem] rotate-[18deg] hidden lg:block"
        />
        <Squiggle
          tone="indigo"
          size={56}
          className="absolute left-[6%] bottom-8 hidden md:block"
        />
        <StarBurst
          tone="indigo"
          size={20}
          className="absolute left-[18%] top-12 hidden md:block"
        />
        <Arrow
          tone="coral"
          size={48}
          className="absolute right-[26%] bottom-10 -rotate-[10deg] hidden lg:block"
        />

        <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-indigo-deep)]">
          <StarBurst tone="indigo" size={14} />
          Admin · Diagnostik
        </span>
        <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Log <AccentInk>API pihak ketiga</AccentInk>.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Setiap permintaan ke OpenAlex, Crossref, KBBI, dan sumber lain
          tercatat di sini lengkap dengan status, durasi, dan cuplikan body
          tanggapan. Klik baris untuk melihat detail.
        </p>
        <Underline
          tone="coral"
          size={140}
          className="mt-3 block opacity-60"
        />
      </Section>

      <Section tone="cream" innerClassName="pb-20 pt-10">
        <div className="mx-auto w-full max-w-[80rem]">
          <FilterBar filters={filters} onChange={setFilters} />

          <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <table className="w-full text-[0.875rem]">
              <thead className="border-b border-[var(--line)] bg-[var(--bg-cream)]/40">
                <tr className="text-left text-[var(--ink-soft)]">
                  <th className="px-3 py-2 font-medium" aria-label="expand" />
                  <th className="px-3 py-2 font-medium">waktu</th>
                  <th className="px-3 py-2 font-medium">provider</th>
                  <th className="px-3 py-2 font-medium">status</th>
                  <th className="px-3 py-2 font-medium">durasi</th>
                  <th className="px-3 py-2 font-medium">url</th>
                  <th className="px-3 py-2 font-medium">outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LogRow key={row.id} row={row} />
                ))}
                {rows.length === 0 && !query.isPending && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-[var(--ink-soft)]"
                    >
                      Belum ada log. Jalankan Track atau Evaluasi dulu.
                    </td>
                  </tr>
                )}
                {query.isPending && (
                  <tr>
                    <td
                      colSpan={7}
                      className="kicker dots-loop px-3 py-8 text-center text-[var(--ink-soft)]"
                    >
                      Memuat<span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </td>
                  </tr>
                )}
                {query.isError && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6">
                      <ErrorBlock error={query.error} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {query.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Memuat…' : 'Muat lebih lama'}
              </Button>
            </div>
          )}
        </div>
      </Section>
    </main>
  )
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (next: Filters) => void
}) {
  const toggleProvider = (p: ApiProvider) => {
    const next = new Set(filters.providers)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    onChange({ ...filters, providers: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker text-[var(--ink-soft)]">provider</span>
        {API_PROVIDERS.map((p) => {
          const active = filters.providers.has(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggleProvider(p)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-[0.75rem] transition',
                active
                  ? 'border-[var(--accent-coral)] bg-[var(--accent-coral)]/10 text-[var(--accent-coral-deep)]'
                  : 'border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-faint)]',
              )}
            >
              {p}
            </button>
          )
        })}
        {filters.providers.size > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, providers: new Set() })}
            className="kicker text-[var(--ink-faint)] underline-offset-4 hover:underline"
          >
            bersihkan
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker text-[var(--ink-soft)]">outcome</span>
        {(['all', 'errors', 'success'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange({ ...filters, outcome: opt })}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-[0.75rem] transition',
              filters.outcome === opt
                ? 'border-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo-deep)]'
                : 'border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-faint)]',
            )}
          >
            {opt}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          placeholder="track job id (uuid)"
          value={filters.trackJobId}
          onChange={(e) =>
            onChange({ ...filters, trackJobId: e.target.value })
          }
          className="h-10 rounded-xl border-[var(--line)] bg-white font-mono text-[0.8125rem] shadow-none"
        />
        <Input
          placeholder="evaluation job id (uuid)"
          value={filters.evalJobId}
          onChange={(e) =>
            onChange({ ...filters, evalJobId: e.target.value })
          }
          className="h-10 rounded-xl border-[var(--line)] bg-white font-mono text-[0.8125rem] shadow-none"
        />
      </div>
    </div>
  )
}

interface LogRowData {
  id: number
  createdAt: Date
  provider: string
  method: string
  url: string
  status: number | null
  outcome: 'success' | 'http_error' | 'network_error' | 'timeout'
  durationMs: number
  errorMessage: string | null
  bodySizeBytes: number | null
  bodyTruncated: boolean
  trackJobId: string | null
  evalJobId: string | null
}

function LogRow({ row }: { row: LogRowData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer border-t border-[var(--line)]/60 transition hover:bg-[var(--bg-cream)]/30"
      >
        <td className="px-3 py-2 text-[var(--ink-faint)]">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </td>
        <td className="px-3 py-2 font-mono tabular-nums text-[var(--ink-soft)]">
          {formatTime(row.createdAt)}
        </td>
        <td className="px-3 py-2">
          <span className="rounded-full bg-[var(--bg-sky)] px-2 py-0.5 font-mono text-[0.75rem] text-[var(--accent-indigo-deep)]">
            {row.provider}
          </span>
        </td>
        <td className="px-3 py-2 font-mono tabular-nums text-[var(--ink)]">
          {row.status ?? '—'}
        </td>
        <td className="px-3 py-2 font-mono tabular-nums text-[var(--ink-soft)]">
          {row.durationMs}ms
        </td>
        <td className="max-w-[28rem] truncate px-3 py-2 font-mono text-[0.8125rem] text-[var(--ink)]">
          {row.url}
        </td>
        <td className="px-3 py-2">
          <OutcomeBadge outcome={row.outcome} />
        </td>
      </tr>
      {expanded && <DetailRow key="detail" row={row} />}
    </>
  )
}

function DetailRow({ row }: { row: LogRowData }) {
  const detail = useQuery({
    queryKey: ['api-log-detail', row.id],
    queryFn: () => getApiCallLog({ data: { id: row.id } }),
  })

  return (
    <tr className="border-t border-[var(--line)]/60 bg-[var(--bg-cream)]/40">
      <td aria-label="detail spacer" />
      <td colSpan={6} className="px-3 py-4">
        <div>
          {detail.isPending && (
            <p className="kicker text-[var(--ink-soft)]">memuat detail…</p>
          )}
          {detail.data && (
            <div className="flex flex-col gap-3 font-mono text-[0.8125rem]">
              <UrlLine row={detail.data} />
              {detail.data.errorMessage && (
                <div className="rounded-lg bg-[var(--bg-blush)] px-3 py-2 text-[var(--accent-coral-deep)]">
                  {detail.data.errorMessage}
                </div>
              )}
              {detail.data.responseHeaders && (
                <HeadersBlock headers={detail.data.responseHeaders} />
              )}
              <BodyBlock
                body={detail.data.bodyPreview}
                truncated={detail.data.bodyTruncated}
                size={detail.data.bodySizeBytes}
                contentType={detail.data.responseHeaders?.['content-type']}
              />
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function UrlLine({ row }: { row: { method: string; url: string } }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-[var(--ink-soft)]">
      <span className="rounded bg-white px-1.5 py-0.5 text-[var(--ink)]">
        {row.method}
      </span>
      <span className="break-all text-[var(--ink)]">{row.url}</span>
    </div>
  )
}

function HeadersBlock({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) return null
  return (
    <div>
      <p className="kicker mb-1 text-[var(--ink-soft)]">headers</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-white px-3 py-2">
        {entries.map(([k, v]) => (
          <FragmentRow key={k} label={k} value={v} />
        ))}
      </dl>
    </div>
  )
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--ink-soft)]">{label}</dt>
      <dd className="break-all text-[var(--ink)]">{value}</dd>
    </>
  )
}

function BodyBlock({
  body,
  truncated,
  size,
  contentType,
}: {
  body: string | null
  truncated: boolean
  size: number | null
  contentType: string | undefined
}) {
  if (!body) {
    return (
      <p className="kicker text-[var(--ink-faint)]">
        Body tidak direkam (binary download atau pengaturan metadata-only).
      </p>
    )
  }
  const isJson = contentType?.includes('application/json') ?? false
  const rendered = isJson ? tryPrettyJson(body) : body

  return (
    <div>
      <p className="kicker mb-1 flex items-baseline gap-2 text-[var(--ink-soft)]">
        <span>body</span>
        {size !== null && (
          <span className="text-[var(--ink-faint)]">
            {formatBytes(size)}
            {truncated && ' · dipotong'}
          </span>
        )}
      </p>
      <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white px-3 py-2 text-[0.8125rem] text-[var(--ink)]">
        {rendered}
      </pre>
    </div>
  )
}

function OutcomeBadge({
  outcome,
}: {
  outcome: 'success' | 'http_error' | 'network_error' | 'timeout'
}) {
  const tone =
    outcome === 'success' ? 'info' : outcome === 'timeout' ? 'warning' : 'error'
  return (
    <span className="severity-badge" data-severity={tone}>
      {outcome}
    </span>
  )
}

function ErrorBlock({ error }: { error: unknown }) {
  return (
    <div className="soft-card flex items-start gap-3 p-4" data-tone="blush">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-coral-deep)]"
        strokeWidth={1.75}
      />
      <p className="text-[var(--ink)]">
        {error instanceof Error ? error.message : 'Gagal memuat log.'}
      </p>
    </div>
  )
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}:${ss}`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function tryPrettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
