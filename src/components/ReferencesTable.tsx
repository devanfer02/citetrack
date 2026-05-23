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
import type { ParsedReference } from '#/services/reference-parser'

interface ReferencesTableProps {
  references: ParsedReference[]
  totalReferences: number
}

export function ReferencesTable({
  references,
  totalReferences,
}: ReferencesTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  function toggleExpand(idx: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Badge variant="secondary">{totalReferences} references found</Badge>

      <div className="overflow-hidden rounded-lg border border-[var(--sea-ink)]/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Author</TableHead>
              <TableHead className="w-16 text-center">Year</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-20 text-center">Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {references.map((ref, idx) => {
              const isExpanded = expandedIds.has(idx)

              return (
                <TableRow key={idx} className="group">
                  <TableCell>
                    <button
                      onClick={() => toggleExpand(idx)}
                      className="rounded p-0.5 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
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
                      onClick={() => toggleExpand(idx)}
                      className="text-left"
                    >
                      <span className="text-sm font-medium text-[var(--sea-ink)]">
                        {ref.author}
                      </span>
                      {isExpanded && (
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="rounded-md border border-[var(--sea-ink)]/5 bg-[var(--sea-ink)]/[0.02] px-3 py-2 text-xs text-[var(--sea-ink-soft)]">
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
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{ref.year}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--sea-ink-soft)]">
                      {ref.title.length > 80
                        ? `${ref.title.slice(0, 80)}...`
                        : ref.title}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      {ref.doi && (
                        <a
                          href={`https://doi.org/${ref.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 text-[var(--lagoon)] hover:bg-[var(--lagoon)]/10"
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
                          className="rounded p-1 text-[var(--lagoon)] hover:bg-[var(--lagoon)]/10"
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
                  className="py-8 text-center text-sm text-[var(--sea-ink-soft)]"
                >
                  No references found. The bibliography section could not be
                  detected.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
