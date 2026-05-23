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
      <Badge className="gap-1 border-accent/20 bg-accent/10 text-accent-foreground">
        <Check className="h-3 w-3" /> {Math.round(confidence * 100)}%
      </Badge>
    )
  }
  if (confidence >= 0.5) {
    return (
      <Badge className="gap-1 border-secondary/40 bg-secondary/20 text-secondary-foreground">
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
        <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
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

      <div className="overflow-hidden rounded-lg border border-border">
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
                  <span className="font-medium text-foreground">
                    {match.citationKey}
                  </span>
                </TableCell>
                <TableCell>
                  {match.referenceTitle ? (
                    <span className="text-sm text-muted-foreground">
                      {match.referenceTitle.length > 60
                        ? `${match.referenceTitle.slice(0, 60)}...`
                        : match.referenceTitle}
                    </span>
                  ) : (
                    <span className="text-sm italic text-destructive">
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
        <div className="rounded-lg border border-secondary/40 bg-secondary/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-secondary-foreground">
            <Link2Off className="h-4 w-4" />
            Unused References
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            These references appear in your bibliography but were never cited
            in-text.
          </p>
          <ul className="flex flex-col gap-1">
            {summary.unusedReferences.map((ref) => (
              <li
                key={ref.id}
                className="text-xs text-muted-foreground"
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
