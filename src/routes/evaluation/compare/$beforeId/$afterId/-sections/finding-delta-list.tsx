import { Link } from '@tanstack/react-router'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Squiggle } from '#/components/doodles'
import { buildHighlightsParam } from '#/schemas/evaluation'
import type { FindingBucket } from '#/lib/evaluation/compare'

type Kind = 'resolved' | 'stillPresent' | 'introduced'
type Tone = 'mint' | 'butter' | 'blush'

const COPY: Record<Kind, { kicker: string; marker: string; empty: string }> = {
  resolved: {
    kicker: 'Yang sudah',
    marker: 'beres',
    empty: 'Belum ada temuan lama yang hilang di evaluation baru.',
  },
  stillPresent: {
    kicker: 'Yang masih',
    marker: 'perlu disentuh',
    empty: 'Semua temuan dari evaluation sebelumnya sudah tidak muncul lagi.',
  },
  introduced: {
    kicker: 'Yang baru',
    marker: 'muncul',
    empty: 'Tidak ada temuan baru di evaluation ini.',
  },
}

export function FindingDeltaList({
  kind,
  tone,
  buckets,
  afterId,
}: {
  kind: Kind
  tone: Tone
  buckets: FindingBucket[]
  afterId: string
}) {
  const copy = COPY[kind]
  return (
    <Section tone={tone} innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        {copy.kicker} <Marker tone="green">{copy.marker}</Marker>.
        <span className="ml-2 text-lg font-semibold tabular-nums text-[var(--ink-soft)]">
          {buckets.length}
        </span>
      </h2>

      {buckets.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 text-[0.9375rem] text-[var(--ink-soft)]">
          <Squiggle tone="indigo" size={32} />
          {copy.empty}
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {buckets.map((b) => (
            <li key={b.key}>
              <BucketRow bucket={b} kind={kind} afterId={afterId} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
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
    <div className="soft-card flex flex-col gap-1.5 px-5 py-3" data-tone="cream">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="break-words font-mono text-[0.9375rem] font-medium text-[var(--ink)]">
          {label}
        </span>
        {bucket.ruleId && (
          <span className="rounded-full bg-[var(--ink)]/8 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            {bucket.ruleId}
          </span>
        )}
        <span className="text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
          {kind === 'resolved'
            ? `muncul ${bucket.beforeCount}× sebelumnya`
            : kind === 'introduced'
              ? `muncul ${bucket.afterCount}×`
              : `${bucket.beforeCount} → ${bucket.afterCount}`}
        </span>
      </div>
      {sample?.message && (
        <p className="break-words text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]">
          {sample.message}
        </p>
      )}
      {canJump && <AccentInk tone="indigo">Buka di evaluation baru →</AccentInk>}
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
