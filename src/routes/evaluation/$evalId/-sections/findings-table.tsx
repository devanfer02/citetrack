import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { ParsedFilter } from '#/lib/evaluation/filter'
import type { VocabClassification } from '#/services/evaluation/vocabulary'

interface FindingsTableProps {
  findings: EvaluationFinding[]
  filter: ParsedFilter
  isLive: boolean
  onEvaluationFindingClick?: (page: number, highlight?: string) => void
  vocabMap?: Map<string, VocabClassification>
  onClassify?: (word: string, classification: VocabClassification) => void
}

const TOKEN_MESSAGE_RE = /^Kata "([^"]+)"|^Istilah (?:teknis|asing) "([^"]+)"/

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

function isClassifiableRule(ruleId: string | null): boolean {
  return !!ruleId && ruleId.startsWith('kbbi.unknown-word')
}

function tokenFromFinding(f: EvaluationFinding): string | null {
  if (!isClassifiableRule(f.ruleId)) return null
  const match = TOKEN_MESSAGE_RE.exec(f.message)
  return match ? (match[1] ?? match[2] ?? '').toLowerCase() : null
}

interface GroupedFinding {
  key: string
  message: string
  severity: EvaluationFinding['severity']
  ruleId: string | null
  suggestion: string | null
  token: string | null
  pages: Array<{ id: number; pageNumber: number | null; excerpt: string | null }>
}

function groupFindings(findings: EvaluationFinding[]): GroupedFinding[] {
  const groups = new Map<string, GroupedFinding>()
  for (const f of findings) {
    const key = `${f.ruleId ?? ''}${f.severity}${f.message}${f.suggestion ?? ''}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        message: f.message,
        severity: f.severity,
        ruleId: f.ruleId,
        suggestion: f.suggestion,
        token: tokenFromFinding(f),
        pages: [],
      }
      groups.set(key, group)
    }
    group.pages.push({
      id: f.id,
      pageNumber: f.pageNumber,
      excerpt: f.excerpt,
    })
  }
  return [...groups.values()]
}

const MAX_PAGES_VISIBLE = 12

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
}: FindingsTableProps) {
  const showClassify = !!vocabMap && !!onClassify
  const grouped = useMemo(() => {
    const scopedFindings = findings.filter((f) => {
      if (filter.severities.size > 0 && !filter.severities.has(f.severity)) {
        return false
      }
      if (filter.query) {
        const q = filter.query
        const hit =
          f.message.toLowerCase().includes(q) ||
          (f.excerpt?.toLowerCase().includes(q) ?? false) ||
          (f.ruleId?.toLowerCase().includes(q) ?? false)
        if (!hit) return false
      }
      if (vocabMap && vocabMap.size > 0) {
        const token = tokenFromFinding(f)
        if (token && vocabMap.has(token)) return false
      }
      return true
    })
    return groupFindings(scopedFindings)
  }, [findings, filter, vocabMap])

  if (!grouped.length) {
    return (
      <p className="py-8 text-center text-sm italic text-[var(--sea-ink-soft)]">
        {filter.query || filter.severities.size > 0
          ? 'Tidak ada temuan untuk filter ini.'
          : isLive
            ? 'Mencari temuan…'
            : 'Tidak ada temuan di bagian ini. Bersih.'}
      </p>
    )
  }

  return (
    <ol className="flex flex-col">
      {grouped.map((g, idx) => {
        const visiblePages = g.pages.slice(0, MAX_PAGES_VISIBLE)
        const hiddenCount = g.pages.length - visiblePages.length
        const firstPage =
          g.pages.find((p) => p.pageNumber !== null)?.pageNumber ?? null
        return (
          <li
            key={g.key}
            className="group relative grid grid-cols-[3rem_1fr] gap-x-5 py-4 first:pt-2 last:pb-2 sm:grid-cols-[4.5rem_1fr]"
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
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--sea-ink-soft)]">
                  <span className="kicker mr-2">muncul di</span>
                  {visiblePages.map((p, i) =>
                    p.pageNumber !== null ? (
                      <span key={p.id}>
                        {i > 0 && (
                          <span aria-hidden className="text-[var(--line)]">
                            ,{' '}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onEvaluationFindingClick?.(
                              p.pageNumber ?? 1,
                              p.excerpt ?? undefined,
                            )
                          }
                          className="inline tabular-nums font-medium text-foreground underline decoration-[var(--line)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--lagoon-deep)] hover:decoration-[var(--lagoon-deep)] focus-visible:outline-none focus-visible:text-[var(--lagoon-deep)] focus-visible:decoration-[var(--lagoon-deep)]"
                          aria-label={`Buka halaman ${p.pageNumber} di pratinjau`}
                        >
                          p.{p.pageNumber}
                        </button>
                      </span>
                    ) : null,
                  )}
                  {hiddenCount > 0 && (
                    <span className="ml-1 italic text-[var(--sea-ink-soft)]/80">
                      {' '}
                      &amp; {hiddenCount} lainnya
                    </span>
                  )}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                {g.ruleId && (
                  <span className="kicker text-[var(--sea-ink-soft)]/80 tabular-nums">
                    {g.ruleId}
                  </span>
                )}
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
