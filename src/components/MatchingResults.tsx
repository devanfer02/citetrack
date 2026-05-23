import { AlertTriangle, Check, HelpCircle, Link2Off, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { MatchSummary } from '#/services/citation-matcher'

interface MatchingResultsProps {
  summary: MatchSummary
}

function ConfidenceBadge({ confidence, matchType }: { confidence: number; matchType: string }) {
  if (matchType === 'unmatched') {
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="h-3 w-3" /> No match
      </Badge>
    )
  }
  if (confidence >= 0.8) {
    return (
      <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3" /> {Math.round(confidence * 100)}%
      </Badge>
    )
  }
  if (confidence >= 0.5) {
    return (
      <Badge className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <HelpCircle className="h-3 w-3" /> {Math.round(confidence * 100)}%
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" /> {Math.round(confidence * 100)}%
    </Badge>
  )
}

export function MatchingResults({ summary }: MatchingResultsProps) {
  const matched = summary.matches.filter((m) => m.matchType !== 'unmatched')
  const unmatched = summary.matches.filter((m) => m.matchType === 'unmatched')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          {matched.length} matched
        </Badge>
        {unmatched.length > 0 && (
          <Badge variant="destructive">
            {unmatched.length} unmatched
          </Badge>
        )}
        {summary.unusedReferences.length > 0 && (
          <Badge variant="outline">
            {summary.unusedReferences.length} unused references
          </Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--sea-ink)]/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Citation</TableHead>
              <TableHead>Matched Reference</TableHead>
              <TableHead className="w-28 text-center">Confidence</TableHead>
              <TableHead className="w-20 text-center">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.matches.map((match) => (
              <TableRow key={match.citationKey}>
                <TableCell>
                  <span className="font-medium text-[var(--sea-ink)]">
                    {match.citationKey}
                  </span>
                </TableCell>
                <TableCell>
                  {match.referenceTitle ? (
                    <span className="text-sm text-[var(--sea-ink-soft)]">
                      {match.referenceTitle.length > 60
                        ? `${match.referenceTitle.slice(0, 60)}...`
                        : match.referenceTitle}
                    </span>
                  ) : (
                    <span className="text-sm italic text-red-500/70">
                      No matching reference found
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <ConfidenceBadge
                    confidence={match.confidence}
                    matchType={match.matchType}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-xs">
                    {match.matchType}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {summary.unusedReferences.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <Link2Off className="h-4 w-4" />
            Unused References
          </div>
          <p className="mb-3 text-xs text-[var(--sea-ink-soft)]">
            These references appear in your bibliography but were never cited
            in-text.
          </p>
          <ul className="flex flex-col gap-1">
            {summary.unusedReferences.map((ref) => (
              <li
                key={ref.id}
                className="text-xs text-[var(--sea-ink-soft)]"
              >
                <span className="font-medium">{ref.author}</span> ({ref.year})
                — {ref.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
