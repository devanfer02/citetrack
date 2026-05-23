import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
interface CitationsTableProps {
  citations: GroupedCitation[]
  totalCitations: number
  uniqueCitations: number
  onRowExpand?: (pageNumber: number) => void
}

export function CitationsTable({
  citations,
  totalCitations,
  uniqueCitations,
  onRowExpand,
}: CitationsTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function toggleExpand(key: string, firstPage: number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        onRowExpand?.(firstPage)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary">{totalCitations} total occurrences</Badge>
        <Badge variant="outline">{uniqueCitations} unique citations</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Citation</TableHead>
              <TableHead className="w-28 text-center">Occurrences</TableHead>
              <TableHead className="w-28 text-center">Pages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {citations.map((citation) => {
              const isExpanded = expandedKeys.has(citation.citationKey)
              const pageNumbers = [
                ...new Set(citation.occurrences.map((o) => o.thesisPage)),
              ].toSorted((a, b) => a - b)

              return (
                <TableRow key={citation.citationKey} className="group">
                  <TableCell>
                    <button
                      onClick={() => toggleExpand(citation.citationKey, pageNumbers[0] ?? 1)}
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
                    <button
                      onClick={() => toggleExpand(citation.citationKey, pageNumbers[0] ?? 1)}
                      className="text-left"
                    >
                      <span className="font-medium text-foreground">
                        {citation.citationKey}
                      </span>
                      {isExpanded && (
                        <div className="mt-3 flex flex-col gap-2">
                          {citation.occurrences.map((occ) => (
                            <div
                              key={`${occ.thesisPage}-${occ.thesisContext.slice(0, 20)}`}
                              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                            >
                              <span className="font-medium text-primary">
                                p.{occ.thesisPage}
                              </span>
                              {': '}
                              {occ.thesisContext}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{citation.count}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {pageNumbers.join(', ')}
                  </TableCell>
                </TableRow>
              )
            })}
            {citations.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No citations found in this document.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
