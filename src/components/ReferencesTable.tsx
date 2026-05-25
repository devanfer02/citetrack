import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
interface ReferencesTableProps {
  references: ParsedReference[]
  totalReferences: number
  onRowExpand?: (pageNumber: number) => void
}

export function ReferencesTable({
  references,
  totalReferences,
  onRowExpand,
}: ReferencesTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  function toggleExpand(idx: number, page: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
        onRowExpand?.(page)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <Badge variant="secondary" className="shrink-0 self-start">
        {totalReferences} references found
      </Badge>

      <Table
        className="table-fixed"
        containerClassName="rounded-lg border border-border lg:min-h-0 lg:flex-1 lg:overflow-auto"
      >
        <TableHeader className="lg:sticky lg:top-0 lg:z-10 lg:bg-card">
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-[30%]">Author</TableHead>
            <TableHead className="w-14 text-center">Year</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-14 text-center">Links</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {references.map((ref, idx) => {
            const isExpanded = expandedIds.has(idx)

            return (
              <TableRow key={ref.rawText}>
                <TableCell className="align-top">
                  <button
                    onClick={() => toggleExpand(idx, ref.startPage ?? 1)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </TableCell>
                <TableCell className="align-top">
                  <button
                    onClick={() => toggleExpand(idx, ref.startPage ?? 1)}
                    className="w-full text-left"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {ref.author}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="text-center align-top">
                  <Badge variant="secondary">{ref.year}</Badge>
                </TableCell>
                <TableCell className="align-top overflow-hidden">
                  <button
                    onClick={() => toggleExpand(idx, ref.startPage ?? 1)}
                    className="w-full text-left"
                  >
                    <span className="block truncate text-sm text-muted-foreground">
                      {ref.title}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {ref.rawText}
                      </div>
                      {(ref.publisher || ref.journal) && (
                        <div className="flex flex-wrap gap-2">
                          {ref.journal && (
                            <Badge variant="outline">{ref.journal}</Badge>
                          )}
                          {ref.publisher && (
                            <Badge variant="outline">{ref.publisher}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center align-top">
                  <div className="flex justify-center gap-1">
                    {ref.doi && (
                      <a
                        href={`https://doi.org/${ref.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-primary hover:bg-primary/10"
                        title={`DOI: ${ref.doi}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {ref.url && !ref.url.includes('doi.org') && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-primary hover:bg-primary/10"
                        title={ref.url}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {references.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No references found. We couldn't detect a Daftar Pustaka
                section.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
