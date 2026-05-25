import { ChevronDown, ChevronRight } from 'lucide-react'
import { ConfidenceBadge } from '#/components/ConfidenceBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { StatusBadge, StatusIcon } from './status-indicators'

interface ResultsTableProps {
  rows: CitationTraceRow[]
  expandedKeys: Set<string>
  onToggleExpand: (key: string) => void
}

export function ResultsTable({
  rows,
  expandedKeys,
  onToggleExpand,
}: ResultsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="w-8" />
            <TableHead>Citation</TableHead>
            <TableHead className="w-16 text-center">Thesis</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-16 text-center">Page</TableHead>
            <TableHead className="w-24 text-center">Confidence</TableHead>
            <TableHead className="w-28 text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedKeys.has(row.citationKey)
            return (
              <TableRow key={row.citationKey}>
                <TableCell>
                  <button
                    onClick={() => onToggleExpand(row.citationKey)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <StatusIcon status={row.status} />
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onToggleExpand(row.citationKey)}
                    className="text-left font-medium text-foreground"
                  >
                    {row.citationKey}
                  </button>
                  {isExpanded && (
                    <div className="mt-3 flex max-w-full flex-col gap-2">
                      <div className="max-w-full rounded-md border border-border bg-muted/30 px-3 py-2">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Thesis context (p.{row.thesisPage}):
                          </p>
                          <div className="max-w-full overflow-x-auto">
                            <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                              {row.thesisContext}
                            </p>
                          </div>
                        </div>
                        {row.matchedPassage && (
                          <div className="max-w-full rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
                            <p className="mb-1 text-xs font-medium text-accent-foreground">
                              Source passage (p.{row.sourcePage}):
                            </p>
                            <div className="max-w-full overflow-x-auto">
                              <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                                {row.matchedPassage}
                              </p>
                            </div>
                          </div>
                        )}
                        {row.reasoning && (
                          <p className="text-xs italic text-muted-foreground">
                            {row.reasoning}
                          </p>
                        )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {row.thesisPage}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {row.referenceTitle
                      ? row.referenceTitle.length > 40
                        ? `${row.referenceTitle.slice(0, 40)}...`
                        : row.referenceTitle
                      : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {row.sourcePage ?? '—'}
                </TableCell>
                <TableCell className="text-center">
                  <ConfidenceBadge confidence={row.passageConfidence} />
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No citations match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
