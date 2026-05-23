import { useMemo } from 'react'
import { Badge } from '#/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { ParsedFilter } from '#/lib/evaluation/filter'
import { severityVariant } from '#/lib/evaluation/utils'
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
    const key = `${f.ruleId ?? ''}\u0001${f.severity}\u0001${f.message}\u0001${f.suggestion ?? ''}`
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

const MAX_PAGES_VISIBLE = 16

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
      <p className="py-6 text-center text-sm text-muted-foreground">
        {filter.query || filter.severities.size > 0
          ? 'No findings match the filter.'
          : isLive
            ? 'Mencari temuan…'
            : 'No issues in this category.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {grouped.map((g) => {
        const visiblePages = g.pages.slice(0, MAX_PAGES_VISIBLE)
        const hiddenCount = g.pages.length - visiblePages.length
        return (
          <li
            key={g.key}
            className="rounded-lg border border-[var(--line)] bg-background px-3 py-2.5"
          >
            <div className="flex items-start gap-2">
              <Badge
                variant={severityVariant(g.severity)}
                className="shrink-0 text-[10px] uppercase tracking-wide"
              >
                {g.severity}
              </Badge>
              <p className="flex-1 min-w-0 text-sm leading-snug">{g.message}</p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              {visiblePages.map((p) =>
                p.pageNumber !== null ? (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      onEvaluationFindingClick?.(
                        p.pageNumber ?? 1,
                        p.excerpt ?? undefined,
                      )
                    }
                    className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={`Buka halaman ${p.pageNumber} di pratinjau PDF`}
                  >
                    p.{p.pageNumber}
                  </button>
                ) : (
                  <span
                    key={p.id}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    —
                  </span>
                ),
              )}
              {hiddenCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  +{hiddenCount} lainnya
                </span>
              )}
            </div>

            {(g.suggestion || (showClassify && g.token)) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-2">
                {g.suggestion && (
                  <span className="text-xs text-muted-foreground">
                    Apakah maksudnya{' '}
                    <a
                      href={kbbiEntryUrl(g.suggestion)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {g.suggestion}
                    </a>
                    ?
                  </span>
                )}
                {showClassify && g.token && (
                  <div className="ml-auto">
                    <Select
                      onValueChange={(value) =>
                        onClassify(g.token!, value as VocabClassification)
                      }
                    >
                      <SelectTrigger size="sm" className="h-7 w-40 text-xs">
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
            )}
          </li>
        )
      })}
    </ul>
  )
}
