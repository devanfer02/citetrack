import { useMemo } from 'react'
import { BookOpen, Check, Undo2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { eydRuleUrl } from '#/lib/evaluation/eyd-rule-urls'
import {
  filterFindings,
  tokenFromFinding,
  type ParsedFilter,
} from '#/lib/evaluation/filter'
import type { VocabClassification } from '#/services/evaluation/vocabulary'

interface FindingsTableProps {
  findings: EvaluationFinding[]
  filter: ParsedFilter
  isLive: boolean
  onEvaluationFindingClick?: (page: number, highlight?: string) => void
  vocabMap?: Map<string, VocabClassification>
  onClassify?: (word: string, classification: VocabClassification) => void
  onToggleResolved?: (findingId: number, resolved: boolean) => void
}

const CLASSIFY_LABELS: Record<VocabClassification, string> = {
  indonesian: 'Kata Indonesia',
  english: 'Istilah asing',
  tech: 'Istilah teknis',
  brand: 'Nama brand',
  ignore: 'Abaikan',
  typo: 'Typo / salah ketik',
}

const SEVERITY_LABEL: Record<EvaluationFinding['severity'], string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

const VERIFICATION_LABEL: Record<string, string> = {
  'kbbi-daring': 'diperiksa: basis data lokal + KBBI daring',
  'basis-data': 'diperiksa: basis data lokal',
}

interface GroupedFinding {
  key: string
  message: string
  severity: EvaluationFinding['severity']
  ruleId: string | null
  suggestion: string | null
  verificationSource: string | null
  token: string | null
  pages: Array<{
    id: number
    pageNumber: number | null
    excerpt: string | null
    token: string | null
    resolved: boolean
  }>
}

function groupFindings(findings: EvaluationFinding[]): GroupedFinding[] {
  const groups = new Map<string, GroupedFinding>()
  for (const f of findings) {
    const key = `${f.ruleId ?? ''}${f.severity}${f.message}${f.suggestion ?? ''}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        message: f.message,
        severity: f.severity,
        ruleId: f.ruleId,
        suggestion: f.suggestion,
        verificationSource: f.verificationSource,
        token: tokenFromFinding(f),
        pages: [],
      }
      groups.set(key, group)
    }
    group.pages.push({
      id: f.id,
      pageNumber: f.pageNumber,
      excerpt: f.excerpt,
      token: f.token ?? null,
      resolved: f.resolvedAt !== null,
    })
  }
  return [...groups.values()]
}

function kbbiEntryUrl(word: string): string {
  return `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(
    word.toLowerCase().trim(),
  )}`
}

export function FindingsTable({
  findings,
  filter,
  isLive,
  onEvaluationFindingClick,
  vocabMap,
  onClassify,
  onToggleResolved,
}: FindingsTableProps) {
  const showClassify = !!vocabMap && !!onClassify
  const showResolve = !!onToggleResolved
  const grouped = useMemo(
    () => groupFindings(filterFindings(findings, filter, vocabMap)),
    [findings, filter, vocabMap],
  )

  if (!grouped.length) {
    return (
      <p className="py-8 text-center text-sm italic text-[var(--sea-ink-soft)]">
        {filter.query || filter.severities.size > 0
          ? 'Tidak ada temuan untuk filter ini.'
          : isLive
            ? 'Mencari temuan…'
            : 'Tidak ada temuan di bagian ini.'}
      </p>
    )
  }

  return (
    <ol className="flex flex-col">
      {grouped.map((g, idx) => {
        const visiblePages = g.pages
        const firstPage =
          g.pages.find((p) => p.pageNumber !== null)?.pageNumber ?? null
        return (
          <li
            key={g.key}
            className="group relative grid grid-cols-[3rem_1fr] gap-x-5 py-4 first:pt-2 last:pb-2 sm:grid-cols-[4.5rem_1fr] [content-visibility:auto] [contain-intrinsic-size:auto_5rem]"
          >
            <span
              aria-hidden
              className="marginalia-rule absolute left-0 top-4 bottom-4 w-px sm:left-[3.75rem]"
              data-severity={g.severity}
            />

            <aside className="flex flex-col items-end gap-1 text-right">
              <span className="kicker tabular-nums text-foreground">
                {firstPage !== null ? `p. ${firstPage}` : '—'}
              </span>
              <span
                className="kicker text-[var(--sea-ink-soft)]"
                data-severity={g.severity}
              >
                {SEVERITY_LABEL[g.severity]}
              </span>
              <span className="kicker text-[var(--sea-ink-soft)]/60 tabular-nums">
                №{String(idx + 1).padStart(2, '0')}
              </span>
            </aside>

            <div className="min-w-0 pl-3 sm:pl-5">
              <p className="text-[0.9375rem] leading-relaxed text-foreground">
                {g.message}
              </p>

              {g.suggestion && (
                <p className="mt-1.5 text-[0.875rem] italic leading-relaxed text-[var(--sea-ink-soft)]">
                  Apakah maksudnya{' '}
                  <a
                    href={kbbiEntryUrl(g.suggestion)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium not-italic text-[var(--lagoon-deep)] underline decoration-[var(--lagoon)]/40 decoration-1 underline-offset-[3px] hover:decoration-[var(--lagoon-deep)]"
                  >
                    {g.suggestion}
                  </a>
                  ?
                </p>
              )}

              {g.pages.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]">
                  <span className="kicker">muncul di</span>
                  {visiblePages.map((p) =>
                    p.pageNumber !== null ? (
                      <span
                        key={p.id}
                        className="inline-flex items-stretch"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onEvaluationFindingClick?.(
                              p.pageNumber ?? 1,
                              p.token ?? g.token ?? p.excerpt ?? undefined,
                            )
                          }
                          className={`inline-flex items-center border px-2.5 py-0.5 text-[0.75rem] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40 ${
                            showResolve
                              ? 'rounded-l-full border-r-0'
                              : 'rounded-full'
                          } ${
                            p.resolved
                              ? 'border-[var(--line)] bg-[var(--bg-cream)] text-[var(--ink-faint)] line-through hover:border-[var(--sea-ink-soft)]'
                              : 'border-[var(--marker-yellow)] bg-[var(--bg-butter)] text-[var(--ink)] hover:border-[var(--accent-coral)] hover:bg-[var(--bg-blush)]'
                          }`}
                          aria-label={`Buka halaman ${p.pageNumber} di pratinjau`}
                        >
                          p.{p.pageNumber}
                        </button>
                        {showResolve && (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleResolved(p.id, !p.resolved)
                            }
                            aria-pressed={p.resolved}
                            className={`focus-ring inline-flex items-center rounded-r-full border border-l-0 px-1.5 transition-colors ${
                              p.resolved
                                ? 'border-[var(--line)] bg-[var(--bg-cream)] text-[var(--ink-soft)] hover:border-[var(--sea-ink-soft)] hover:text-[var(--ink)]'
                                : 'border-[var(--marker-yellow)] bg-[var(--bg-butter)] text-[var(--ink-soft)] hover:border-[var(--accent-coral)] hover:bg-[var(--bg-blush)] hover:text-[var(--ink)]'
                            }`}
                            aria-label={
                              p.resolved
                                ? `Pulihkan temuan di halaman ${p.pageNumber}`
                                : `Tandai selesai untuk halaman ${p.pageNumber}`
                            }
                            title={
                              p.resolved
                                ? 'Pulihkan'
                                : 'Tandai selesai'
                            }
                          >
                            {p.resolved ? (
                              <Undo2
                                className="h-3 w-3"
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                            ) : (
                              <Check
                                className="h-3 w-3"
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        )}
                      </span>
                    ) : null,
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                {g.ruleId && (
                  <span className="kicker text-[var(--sea-ink-soft)]/80 tabular-nums">
                    {g.ruleId}
                  </span>
                )}
                {g.verificationSource &&
                  VERIFICATION_LABEL[g.verificationSource] && (
                    <span className="kicker text-[var(--sea-ink-soft)]/80">
                      {VERIFICATION_LABEL[g.verificationSource]}
                    </span>
                  )}
                {(() => {
                  const ruleUrl = eydRuleUrl(g.ruleId)
                  if (!ruleUrl) return null
                  return (
                    <a
                      href={ruleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kicker inline-flex items-baseline gap-1 text-[var(--lagoon-deep)] underline decoration-[var(--lagoon)]/40 decoration-1 underline-offset-[3px] transition-colors hover:decoration-[var(--lagoon-deep)]"
                    >
                      <BookOpen
                        className="h-3 w-3 translate-y-[2px]"
                        strokeWidth={2}
                      />
                      lihat aturan EYD
                    </a>
                  )
                })()}
                {showClassify && g.token && (
                  <div className="ml-auto">
                    <Select
                      onValueChange={(value) =>
                        onClassify(g.token!, value as VocabClassification)
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 w-[10rem] border-0 border-b border-dashed border-[var(--line)] bg-transparent px-1 text-xs shadow-none hover:border-[var(--lagoon-deep)] focus:ring-0 data-[state=open]:border-[var(--lagoon-deep)]"
                      >
                        <SelectValue placeholder="Klasifikasi…" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CLASSIFY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
