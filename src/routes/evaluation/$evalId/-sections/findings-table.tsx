import { useMemo } from 'react'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { severityVariant } from '#/lib/evaluation/utils'

interface FindingsTableProps {
  findings: EvaluationFinding[]
  filter: string
  isLive: boolean
  onEvaluationFindingClick?: (page: number, highlight?: string) => void
}

export function FindingsTable({
  findings,
  filter,
  isLive,
  onEvaluationFindingClick,
}: FindingsTableProps) {
  const filtered = useMemo(() => {
    if (!filter.trim()) return findings
    const q = filter.toLowerCase()
    return findings.filter(
      (f) =>
        f.message.toLowerCase().includes(q) ||
        (f.excerpt?.toLowerCase().includes(q) ?? false) ||
        (f.ruleId?.toLowerCase().includes(q) ?? false),
    )
  }, [findings, filter])

  if (!filtered.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {filter
          ? 'No findings match the filter.'
          : isLive
            ? 'Mencari temuan…'
            : 'No issues in this category.'}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Page</TableHead>
            <TableHead className="w-24">Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Excerpt</TableHead>
            <TableHead>Suggestion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((f) => {
            const clickable = onEvaluationFindingClick && f.pageNumber !== null
            const jump = clickable
              ? () =>
                  onEvaluationFindingClick(
                    f.pageNumber ?? 1,
                    f.excerpt ?? undefined,
                  )
              : undefined
            return (
              <TableRow
                key={f.id}
                onClick={jump}
                className={
                  clickable
                    ? 'cursor-pointer transition-colors hover:bg-muted/40'
                    : undefined
                }
              >
                <TableCell>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        jump?.()
                      }}
                      className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      aria-label={`Buka halaman ${f.pageNumber} di pratinjau PDF`}
                    >
                      p.{f.pageNumber}
                    </button>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={severityVariant(f.severity)}>
                    {f.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{f.message}</TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">
                  {f.excerpt ?? '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {f.suggestion ? (
                    <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5">
                      {f.suggestion}
                    </code>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
