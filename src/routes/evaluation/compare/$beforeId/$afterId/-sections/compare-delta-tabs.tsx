import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Section } from '#/components/Section'
import { Squiggle } from '#/components/doodles'
import { buildHighlightsParam } from '#/schemas/evaluation'
import type { CompareDelta } from '#/schemas/evaluation'
import type { FindingBucket } from '#/lib/evaluation/compare'

type Kind = 'resolved' | 'stillPresent' | 'introduced'

const TAB_META: Record<
  CompareDelta,
  { kind: Kind; label: string; emptyCopy: string }
> = {
  beres: {
    kind: 'resolved',
    label: 'Yang sudah beres',
    emptyCopy: 'Belum ada temuan lama yang hilang di evaluation baru.',
  },
  belum: {
    kind: 'stillPresent',
    label: 'Yang masih perlu disentuh',
    emptyCopy: 'Semua temuan dari evaluation sebelumnya sudah tidak muncul lagi.',
  },
  baru: {
    kind: 'introduced',
    label: 'Yang baru muncul',
    emptyCopy: 'Tidak ada temuan baru di evaluation ini.',
  },
}

const TAB_ORDER: readonly CompareDelta[] = ['belum', 'beres', 'baru']

const RULE_FALLBACK = '(tanpa rule id)'

const INITIAL_BUCKETS_PER_GROUP = 5

export function CompareDeltaTabs({
  active,
  swap,
  beforeId,
  afterId,
  resolved,
  stillPresent,
  introduced,
}: {
  active: CompareDelta
  swap: boolean
  beforeId: string
  afterId: string
  resolved: FindingBucket[]
  stillPresent: FindingBucket[]
  introduced: FindingBucket[]
}) {
  const counts: Record<CompareDelta, number> = {
    belum: stillPresent.length,
    beres: resolved.length,
    baru: introduced.length,
  }
  const bucketsByTab: Record<CompareDelta, FindingBucket[]> = {
    belum: stillPresent,
    beres: resolved,
    baru: introduced,
  }
  const meta = TAB_META[active]
  const activeBuckets = bucketsByTab[active]

  return (
    <Section tone="cream" innerClassName="pb-12 pt-2">
      <div
        role="tablist"
        aria-label="Daftar temuan"
        className="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-[var(--line)] pb-3"
      >
        {TAB_ORDER.map((key) => {
          const tab = TAB_META[key]
          const isActive = key === active
          return (
            <Link
              key={key}
              role="tab"
              aria-selected={isActive}
              to="/evaluation/compare/$beforeId/$afterId"
              params={{ beforeId, afterId }}
              search={{ delta: key, swap }}
              replace
              resetScroll={false}
              className={`group relative inline-flex items-baseline gap-2 pb-1 text-[0.9375rem] transition-colors ${
                isActive
                  ? 'font-extrabold text-[var(--ink)]'
                  : 'font-semibold text-[var(--ink)]/70 hover:text-[var(--ink)]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`tabular-nums text-[0.8125rem] font-bold ${
                  isActive ? 'text-[var(--ink)]' : 'text-[var(--ink)]/60'
                }`}
              >
                {counts[key]}
              </span>
              <span
                aria-hidden
                className={`absolute -bottom-[calc(0.75rem+1px)] left-0 h-0.5 w-full origin-left bg-[var(--ink)] transition-transform duration-200 ${
                  isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                }`}
              />
            </Link>
          )
        })}
      </div>

      {activeBuckets.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 text-[0.9375rem] text-[var(--ink-soft)]">
          <Squiggle tone="indigo" size={32} />
          {meta.emptyCopy}
        </div>
      ) : (
        <RuleGroupedList
          kind={meta.kind}
          buckets={activeBuckets}
          afterId={afterId}
        />
      )}
    </Section>
  )
}

type RuleGroup = {
  ruleId: string | null
  category: 'kbbi' | 'eyd'
  buckets: FindingBucket[]
  beforeTotal: number
  afterTotal: number
}

function RuleGroupedList({
  kind,
  buckets,
  afterId,
}: {
  kind: Kind
  buckets: FindingBucket[]
  afterId: string
}) {
  const groups = useMemo(() => groupByRule(buckets), [buckets])

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group, idx) => (
        <li key={`${group.category}|${group.ruleId ?? ''}`}>
          <RuleGroupCard
            group={group}
            kind={kind}
            afterId={afterId}
            defaultOpen={idx === 0}
          />
        </li>
      ))}
    </ul>
  )
}

function groupByRule(buckets: FindingBucket[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>()
  for (const b of buckets) {
    const key = `${b.category}|${b.ruleId ?? ''}`
    let group = map.get(key)
    if (!group) {
      group = {
        ruleId: b.ruleId,
        category: b.category,
        buckets: [],
        beforeTotal: 0,
        afterTotal: 0,
      }
      map.set(key, group)
    }
    group.buckets.push(b)
    group.beforeTotal += b.beforeCount
    group.afterTotal += b.afterCount
  }
  return [...map.values()].toSorted((a, b) => {
    const aTotal = Math.max(a.afterTotal, a.beforeTotal)
    const bTotal = Math.max(b.afterTotal, b.beforeTotal)
    return bTotal - aTotal
  })
}

function RuleGroupCard({
  group,
  kind,
  afterId,
  defaultOpen,
}: {
  group: RuleGroup
  kind: Kind
  afterId: string
  defaultOpen: boolean
}) {
  // defaultOpen seeds the initial collapse state only. The user owns it
  // after that — no syncing back from the prop is intended.
  // react-doctor-disable-next-line no-derived-useState
  const [open, setOpen] = useState(defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const total = group.buckets.length
  const visibleBuckets = showAll
    ? group.buckets
    : group.buckets.slice(0, INITIAL_BUCKETS_PER_GROUP)
  const overflow = total - visibleBuckets.length
  const ruleLabel = group.ruleId ?? RULE_FALLBACK

  return (
    <article
      className="soft-card overflow-hidden p-0"
      data-tone="cream"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40"
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="kicker text-[var(--ink-faint)]">{group.category}</span>
          <span className="font-mono text-[0.8125rem] font-medium text-[var(--ink)]">
            {ruleLabel}
          </span>
          <span className="tabular-nums text-[0.8125rem] text-[var(--ink-soft)]">
            {formatGroupDelta(group, kind)}
          </span>
        </div>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-[var(--ink-soft)] transition-transform duration-150 ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--line)] bg-white/30 p-3">
          <ul className="flex flex-col gap-2">
            {visibleBuckets.map((bucket) => (
              <li key={bucket.key}>
                <BucketRow bucket={bucket} kind={kind} afterId={afterId} />
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 inline-flex items-baseline gap-1.5 px-2 py-1 text-[0.8125rem] font-medium text-[var(--accent-indigo-deep)] underline-offset-2 hover:underline"
            >
              Tampilkan {overflow} sisanya
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function formatGroupDelta(group: RuleGroup, kind: Kind): string {
  if (kind === 'resolved') return `muncul ${group.beforeTotal}× sebelumnya`
  if (kind === 'introduced') return `muncul ${group.afterTotal}×`
  return `${group.beforeTotal} → ${group.afterTotal}`
}

function BucketRow({
  bucket,
  kind,
  afterId,
}: {
  bucket: FindingBucket
  kind: Kind
  afterId: string
}) {
  const label =
    bucket.token ||
    bucket.sampleAfter?.excerpt ||
    bucket.sampleBefore?.excerpt ||
    '(tanpa token)'
  const sample = bucket.sampleAfter ?? bucket.sampleBefore
  const canJump = kind !== 'resolved' && bucket.sampleAfter?.pageNumber != null

  const inner = (
    <div className="flex flex-col gap-1 rounded-xl bg-white/70 px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="break-words font-mono text-[0.875rem] font-medium text-[var(--ink)]">
          {label}
        </span>
        <span className="text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
          {kind === 'resolved'
            ? `muncul ${bucket.beforeCount}× sebelumnya`
            : kind === 'introduced'
              ? `muncul ${bucket.afterCount}×`
              : `${bucket.beforeCount} → ${bucket.afterCount}`}
        </span>
        {canJump && (
          <span className="text-[0.75rem] text-[var(--accent-indigo-deep)]">
            buka di evaluation baru →
          </span>
        )}
      </div>
      {sample?.message && (
        <p className="break-words text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]">
          {sample.message}
        </p>
      )}
    </div>
  )

  if (canJump) {
    const page = bucket.sampleAfter!.pageNumber!
    const token = bucket.token ?? bucket.sampleAfter!.excerpt ?? ''
    return (
      <Link
        to="/evaluation/$evalId"
        params={{ evalId: afterId }}
        search={{ highlights: buildHighlightsParam(page, token) }}
        className="block no-underline"
      >
        {inner}
      </Link>
    )
  }
  return inner
}
