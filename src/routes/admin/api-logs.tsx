import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { Input } from '#/components/ui/input'
import { isLocalEnv } from '#/env'
import { cn, formatDurationMs } from '#/lib/utils'
import {
  getApiCallLog,
  getApiCallLogStats,
  listApiCallLogs,
} from '#/services/logs/api-logs'
import {
  API_PROVIDERS,
  type ApiProvider,
} from '#/services/logs/providers'

type OutcomeFilter = 'all' | 'errors' | 'success' | 'aborted'

interface Filters {
  providers: Set<ApiProvider>
  outcome: OutcomeFilter
  url: string
  status: string
  trackJobId: string
  evalJobId: string
}

interface ApiLogQueryArgs {
  provider: ApiProvider[] | undefined
  outcome: OutcomeFilter
  url: string | undefined
  status: number | undefined
  trackJobId: string | undefined
  evalJobId: string | undefined
  from: string | undefined
  to: string | undefined
  pageSize: number
  page: number
}

const PAGE_SIZE = 50

const defaultApiLogArgs: Omit<ApiLogQueryArgs, 'page'> = {
  provider: undefined,
  outcome: 'all',
  url: undefined,
  status: undefined,
  trackJobId: undefined,
  evalJobId: undefined,
  from: undefined,
  to: undefined,
  pageSize: PAGE_SIZE,
}

// A status filter is only meaningful as a complete 3-digit HTTP code in the
// 1xx–5xx range; anything else (empty, partial, garbage) means "no filter".
function parseStatusCode(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!/^\d{3}$/.test(trimmed)) return undefined
  const code = Number(trimmed)
  return code >= 100 && code <= 599 ? code : undefined
}

// Search params are simple YYYY-MM-DD strings so the URL stays short
// and shareable. We expand them to full ISO datetimes (UTC) before
// sending to the server: `from` → start-of-day, `to` → end-of-day.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const apiLogsSearchSchema = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  page: z.number().int().min(1).optional(),
})
type ApiLogsSearch = z.infer<typeof apiLogsSearchSchema>

function fromDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd}T00:00:00.000Z`
}
function toDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd}T23:59:59.999Z`
}

function searchToDateArgs(
  search: ApiLogsSearch,
): Pick<ApiLogQueryArgs, 'from' | 'to'> {
  return {
    from: search.from ? fromDateToIso(search.from) : undefined,
    to: search.to ? toDateToIso(search.to) : undefined,
  }
}

function apiLogsQueryOptions(args: ApiLogQueryArgs) {
  return {
    queryKey: ['api-logs', args] as const,
    queryFn: () => listApiCallLogs({ data: args }),
  }
}

export const Route = createFileRoute('/admin/api-logs')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: ApiLogsPage,
  head: () => ({ meta: [{ title: 'API logs · CiteTrack' }] }),
  validateSearch: zodValidator(apiLogsSearchSchema),
  loaderDeps: ({ search: { from, to, page } }) => ({ from, to, page }),
  loader: ({ context, deps: { from, to, page } }) =>
    context.queryClient.ensureQueryData(
      apiLogsQueryOptions({
        ...defaultApiLogArgs,
        ...searchToDateArgs({ from, to }),
        page: page ?? 1,
      }),
    ),
})

function ApiLogsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const currentPage = search.page ?? 1
  const [filters, setFilters] = useState<Filters>({
    providers: new Set(),
    outcome: 'all',
    url: '',
    status: '',
    trackJobId: '',
    evalJobId: '',
  })

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        providers: [...filters.providers].toSorted(),
        outcome: filters.outcome,
        url: filters.url.trim(),
        status: parseStatusCode(filters.status) ?? '',
        trackJobId: filters.trackJobId.trim(),
        evalJobId: filters.evalJobId.trim(),
      }),
    [filters],
  )

  // When filters change, reset to page 1. Date range and provider/outcome
  // filters narrow the result set; staying on (say) page 5 of the old
  // filter would land on a page the new result set doesn't have.
  useEffect(() => {
    if (currentPage !== 1) {
      navigate({ search: (prev) => ({ ...prev, page: undefined }), replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  const queryArgs = useMemo<ApiLogQueryArgs>(
    () => ({
      provider:
        filters.providers.size > 0 ? [...filters.providers] : undefined,
      outcome: filters.outcome,
      url: filters.url.trim().length > 0 ? filters.url.trim() : undefined,
      status: parseStatusCode(filters.status),
      trackJobId:
        filters.trackJobId.trim().length > 0
          ? filters.trackJobId.trim()
          : undefined,
      evalJobId:
        filters.evalJobId.trim().length > 0
          ? filters.evalJobId.trim()
          : undefined,
      ...searchToDateArgs(search),
      pageSize: PAGE_SIZE,
      page: currentPage,
    }),
    [filters, search, currentPage],
  )

  const query = useQuery({
    ...apiLogsQueryOptions(queryArgs),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const statsArgs = useMemo(
    () => ({
      provider: queryArgs.provider,
      url: queryArgs.url,
      trackJobId: queryArgs.trackJobId,
      evalJobId: queryArgs.evalJobId,
      from: queryArgs.from,
      to: queryArgs.to,
    }),
    [queryArgs],
  )

  const statsQuery = useQuery({
    queryKey: ['api-logs-stats', statsArgs] as const,
    queryFn: () => getApiCallLogStats({ data: statsArgs }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0
  const totalPages = query.data?.totalPages ?? 1

  return (
    <main id="main-content" className="flex-1">
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
          <StatsPanel stats={statsQuery.data} isPending={statsQuery.isPending} />

          <FilterBar
            filters={filters}
            onChange={setFilters}
            search={search}
            onSearchChange={(next) =>
              navigate({ search: next, replace: true })
            }
          />

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

          <ApiLogsPagination
            page={currentPage}
            totalPages={totalPages}
            total={total}
            shown={rows.length}
          />
        </div>
      </Section>
    </main>
  )
}

type DatePreset = 'all' | 'today' | '7d' | '30d'

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function activePreset(search: ApiLogsSearch): DatePreset | null {
  if (!search.from && !search.to) return 'all'
  if (!search.from || !search.to) return null
  const today = formatLocalDate(new Date())
  if (search.to !== today) return null
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return formatLocalDate(d)
  }
  if (search.from === today) return 'today'
  if (search.from === daysAgo(6)) return '7d'
  if (search.from === daysAgo(29)) return '30d'
  return null
}

function FilterBar({
  filters,
  onChange,
  search,
  onSearchChange,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  search: ApiLogsSearch
  onSearchChange: (next: ApiLogsSearch) => void
}) {
  const toggleProvider = (p: ApiProvider) => {
    const next = new Set(filters.providers)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    onChange({ ...filters, providers: next })
  }

  const applyPreset = (preset: DatePreset) => {
    if (preset === 'all') {
      onSearchChange({})
      return
    }
    const today = new Date()
    const todayStr = formatLocalDate(today)
    const fromDate = new Date(today)
    if (preset === '7d') fromDate.setDate(fromDate.getDate() - 6)
    if (preset === '30d') fromDate.setDate(fromDate.getDate() - 29)
    onSearchChange({ from: formatLocalDate(fromDate), to: todayStr })
  }

  const currentPreset = activePreset(search)

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
        {(['all', 'errors', 'success', 'aborted'] as const).map((opt) => (
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker text-[var(--ink-soft)]">tanggal</span>
        {(
          [
            ['all', 'semua'],
            ['today', 'hari ini'],
            ['7d', '7 hari'],
            ['30d', '30 hari'],
          ] as const
        ).map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-[0.75rem] transition',
              currentPreset === preset
                ? 'border-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo-deep)]'
                : 'border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--ink-faint)]',
            )}
          >
            {label}
          </button>
        ))}
        <span className="kicker ml-1 text-[var(--ink-faint)]">dari</span>
        <input
          type="date"
          value={search.from ?? ''}
          max={search.to ?? undefined}
          onChange={(e) =>
            onSearchChange({ ...search, from: e.target.value || undefined })
          }
          aria-label="Tanggal mulai"
          className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 font-mono text-[0.75rem] text-[var(--ink)] outline-none focus:border-[var(--accent-indigo)]"
        />
        <span className="kicker text-[var(--ink-faint)]">s/d</span>
        <input
          type="date"
          value={search.to ?? ''}
          min={search.from ?? undefined}
          onChange={(e) =>
            onSearchChange({ ...search, to: e.target.value || undefined })
          }
          aria-label="Tanggal akhir"
          className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 font-mono text-[0.75rem] text-[var(--ink)] outline-none focus:border-[var(--accent-indigo)]"
        />
        {(search.from || search.to) && (
          <button
            type="button"
            onClick={() => onSearchChange({})}
            className="kicker text-[var(--ink-faint)] underline-offset-4 hover:underline"
          >
            bersihkan
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="cari url (mis. kbbi.web.id)"
          value={filters.url}
          onChange={(e) => onChange({ ...filters, url: e.target.value })}
          aria-label="Cari berdasarkan URL"
          className="h-10 flex-1 rounded-xl border-[var(--line)] bg-white font-mono text-[0.8125rem] shadow-none"
        />
        <Input
          placeholder="status (mis. 404)"
          inputMode="numeric"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          aria-label="Filter kode status HTTP"
          className="h-10 rounded-xl border-[var(--line)] bg-white font-mono text-[0.8125rem] shadow-none sm:w-44"
        />
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
  outcome: 'success' | 'http_error' | 'network_error' | 'timeout' | 'aborted'
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
          {formatDurationMs(row.durationMs) ?? '—'}
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
                  <ErrorMessageWithLinks message={detail.data.errorMessage} />
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
  outcome: 'success' | 'http_error' | 'network_error' | 'timeout' | 'aborted'
}) {
  // `aborted` is our own lookup cap, not a failure — render it warning
  // (yellow), distinct from success (sky/info) and the error reds.
  const tone =
    outcome === 'success'
      ? 'info'
      : outcome === 'aborted'
        ? 'warning'
        : outcome === 'timeout'
          ? 'warning'
          : 'error'
  return (
    <span className="severity-badge" data-severity={tone}>
      {outcome}
    </span>
  )
}

// Renders an errorMessage string, turning the "Setelan → KBBI" pointer
// (legacy logs say "Pengaturan → KBBI") into a real link to the KBBI admin
// panel on /evaluation so admins can act on the message without manual
// navigation.
const SETTINGS_KBBI_MARKERS = [
  'Setelan → KBBI',
  'Pengaturan → KBBI',
] as const

function ErrorMessageWithLinks({ message }: { message: string }) {
  const marker = SETTINGS_KBBI_MARKERS.find((m) => message.includes(m))
  if (!marker) return <>{message}</>
  const [before, after] = message.split(marker)
  return (
    <>
      {before}
      <Link
        to="/evaluation"
        className="font-medium underline underline-offset-2 hover:text-[var(--accent-coral-deep)]"
      >
        {marker}
      </Link>
      {after}
    </>
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

interface ApiLogsStats {
  total: number
  errors: number
  errorRate: number
  byOutcome: {
    success: number
    http_error: number
    network_error: number
    timeout: number
    aborted: number
  }
  byProvider: Array<{
    provider: string
    total: number
    success: number
    errors: number
    httpError: number
    networkError: number
    timeout: number
    aborted: number
    errorRate: number
  }>
  avgDurationMs: number
  p95DurationMs: number
}

function StatsPanel({
  stats,
  isPending,
}: {
  stats: ApiLogsStats | undefined
  isPending: boolean
}) {
  if (isPending && !stats) {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white px-6 py-5 text-[0.875rem] text-[var(--ink-soft)]">
        <span className="kicker dots-loop">
          Menghitung statistik<span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
    )
  }
  if (!stats || stats.total === 0) {
    return null
  }

  const successRate = stats.total === 0 ? 0 : stats.byOutcome.success / stats.total

  return (
    <section
      aria-label="Statistik panggilan API"
      className="mb-6 rounded-2xl border border-[var(--line)] bg-white px-6 py-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="kicker text-[var(--accent-indigo-deep)]">Statistik</span>
        <span className="kicker tabular-nums text-[var(--ink-faint)]">
          {stats.total} panggilan
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total"
          value={stats.total}
          hint="semua panggilan dalam rentang ini"
        />
        <StatCard
          label="Berhasil"
          value={stats.byOutcome.success}
          hint={`${(successRate * 100).toFixed(1)}% dari total`}
          tone="success"
        />
        <StatCard
          label="Gagal"
          value={stats.errors}
          hint={`${(stats.errorRate * 100).toFixed(1)}% dari total`}
          tone={stats.errorRate > 0.1 ? 'error' : 'warning'}
        />
        <StatCard
          label="Dihentikan"
          value={stats.byOutcome.aborted}
          hint={
            stats.total === 0
              ? 'tidak ada panggilan'
              : `${((stats.byOutcome.aborted / stats.total) * 100).toFixed(1)}% dari total · batas KBBI`
          }
          tone="warning"
        />
        <StatCard
          label="Rata-rata durasi"
          value={formatDurationMs(stats.avgDurationMs) ?? '—'}
          hint={`p95: ${formatDurationMs(stats.p95DurationMs) ?? '—'}`}
        />
      </div>

      {stats.errors > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <OutcomeStat
            label="HTTP error"
            value={stats.byOutcome.http_error}
            total={stats.total}
          />
          <OutcomeStat
            label="Network error"
            value={stats.byOutcome.network_error}
            total={stats.total}
          />
          <OutcomeStat
            label="Timeout"
            value={stats.byOutcome.timeout}
            total={stats.total}
          />
        </div>
      )}

      {stats.byProvider.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="kicker text-[var(--ink-soft)]">
              Per penyedia
            </span>
            <span className="kicker text-[var(--ink-faint)]">
              urut: error terbanyak
            </span>
          </div>
          <ProviderBreakdown providers={stats.byProvider} />
        </div>
      )}
    </section>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint: string
  tone?: 'success' | 'warning' | 'error'
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-[var(--bg-mint)]'
      : tone === 'warning'
        ? 'bg-[var(--bg-butter)]'
        : tone === 'error'
          ? 'bg-[var(--bg-blush)]'
          : 'bg-[var(--bg-cream)]/40'

  return (
    <div className={cn('rounded-xl px-4 py-3', toneClass)}>
      <p className="kicker text-[var(--ink-soft)]">{label}</p>
      <p className="display-title mt-1 text-2xl font-extrabold tabular-nums leading-tight text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-[0.75rem] leading-snug text-[var(--ink-soft)]">
        {hint}
      </p>
    </div>
  )
}

function OutcomeStat({
  label,
  value,
  total,
}: {
  label: string
  value: number
  total: number
}) {
  const pct = total === 0 ? 0 : (value / total) * 100
  return (
    <div className="rounded-lg border border-[var(--line)] px-3 py-2">
      <p className="kicker text-[var(--ink-soft)]">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-[1rem] font-bold tabular-nums text-[var(--ink)]">
          {value}
        </span>
        <span className="kicker tabular-nums text-[var(--ink-faint)]">
          {pct.toFixed(1)}%
        </span>
      </p>
    </div>
  )
}

function ProviderBreakdown({
  providers,
}: {
  providers: ApiLogsStats['byProvider']
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <table className="w-full text-[0.8125rem]">
        <thead className="border-b border-[var(--line)] bg-[var(--bg-cream)]/40">
          <tr className="text-left text-[var(--ink-soft)]">
            <th className="px-3 py-2 font-medium">penyedia</th>
            <th className="px-3 py-2 text-right font-medium">total</th>
            <th className="px-3 py-2 text-right font-medium">berhasil</th>
            <th className="px-3 py-2 text-right font-medium">gagal</th>
            <th className="px-3 py-2 text-right font-medium">% gagal</th>
            <th className="px-3 py-2 font-medium">rincian</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr
              key={p.provider}
              className="border-t border-[var(--line)]/60"
            >
              <td className="px-3 py-2">
                <span className="rounded-full bg-[var(--bg-sky)] px-2 py-0.5 font-mono text-[0.75rem] text-[var(--accent-indigo-deep)]">
                  {p.provider}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                {p.total}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--ink-soft)]">
                {p.success}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                {p.errors}
              </td>
              <td className="px-3 py-2 text-right">
                <ErrorRatePill rate={p.errorRate} />
              </td>
              <td className="px-3 py-2 text-[0.75rem] text-[var(--ink-soft)]">
                <ProviderErrorBreakdown
                  httpError={p.httpError}
                  networkError={p.networkError}
                  timeout={p.timeout}
                  aborted={p.aborted}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorRatePill({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1)
  const tone = rate === 0 ? 'mint' : rate < 0.05 ? 'sky' : rate < 0.2 ? 'butter' : 'blush'
  const toneClass =
    tone === 'mint'
      ? 'bg-[var(--bg-mint)] text-[var(--ink)]'
      : tone === 'sky'
        ? 'bg-[var(--bg-sky)] text-[var(--accent-indigo-deep)]'
        : tone === 'butter'
          ? 'bg-[var(--bg-butter)] text-[var(--ink)]'
          : 'bg-[var(--bg-blush)] text-[var(--accent-coral-deep)]'
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 font-mono text-[0.75rem] tabular-nums',
        toneClass,
      )}
    >
      {pct}%
    </span>
  )
}

function ProviderErrorBreakdown({
  httpError,
  networkError,
  timeout,
  aborted,
}: {
  httpError: number
  networkError: number
  timeout: number
  aborted: number
}) {
  const parts: Array<{ label: string; count: number; tone: 'error' | 'warning' }> = []
  if (httpError > 0) parts.push({ label: 'HTTP error', count: httpError, tone: 'error' })
  if (networkError > 0) parts.push({ label: 'jaringan', count: networkError, tone: 'error' })
  if (timeout > 0) parts.push({ label: 'timeout', count: timeout, tone: 'warning' })
  if (aborted > 0) parts.push({ label: 'dihentikan', count: aborted, tone: 'warning' })
  if (parts.length === 0) return <span className="text-[var(--ink-faint)]">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span
          key={p.label}
          className="severity-badge inline-flex items-baseline gap-1"
          data-severity={p.tone}
        >
          <span className="font-mono tabular-nums">{p.count}</span>
          <span>{p.label}</span>
        </span>
      ))}
    </div>
  )
}

function ApiLogsPagination({
  page,
  totalPages,
  total,
  shown,
}: {
  page: number
  totalPages: number
  total: number
  shown: number
}) {
  if (total === 0) return null

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages

  return (
    <nav
      aria-label="Navigasi halaman log"
      className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-t border-[var(--line)] pt-5"
    >
      <p className="kicker text-[var(--ink-soft)]">
        <span className="tabular-nums text-foreground">{shown}</span>{' '}
        <span>dari</span>{' '}
        <span className="tabular-nums text-foreground">{total}</span>{' '}
        log
      </p>
      <div className="flex items-baseline gap-x-5">
        <ApiLogsPageLink
          disabled={prevDisabled}
          page={page - 1}
          label="Halaman sebelumnya"
          dir="prev"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </ApiLogsPageLink>
        <span className="kicker tabular-nums text-[var(--ink-soft)]/80">
          hlm {page} / {totalPages}
        </span>
        <ApiLogsPageLink
          disabled={nextDisabled}
          page={page + 1}
          label="Halaman berikutnya"
          dir="next"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </ApiLogsPageLink>
      </div>
    </nav>
  )
}

function ApiLogsPageLink({
  disabled,
  page,
  label,
  dir,
  children,
}: {
  disabled: boolean
  page: number
  label: string
  dir: 'prev' | 'next'
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (tidak tersedia)`}
        className="kicker inline-flex cursor-not-allowed items-baseline gap-1 text-[var(--ink-soft)]/40"
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      to="/admin/api-logs"
      search={(prev) => ({ ...prev, page: page === 1 ? undefined : page })}
      aria-label={label}
      rel={dir}
      className="kicker inline-flex items-baseline gap-1 text-[var(--ink-soft)] transition-colors hover:text-[var(--accent-indigo-deep)]"
    >
      {children}
    </Link>
  )
}
