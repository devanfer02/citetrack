import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, FileQuestion, FileX } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { ConfidenceBadge } from '#/components/ConfidenceBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

interface PassageResultsProps {
  results: PassageResult[]
  matched: number
  noSource: number
  noMatch: number
  total: number
  avgConfidence: number
}

function StatusIcon({ status }: { status: PassageResult['status'] }) {
  switch (status) {
    case 'matched':
      return <BookOpen className="h-4 w-4 text-accent-foreground" />
    case 'no-source':
      return <FileX className="h-4 w-4 text-destructive" />
    case 'no-match':
      return <FileQuestion className="h-4 w-4 text-muted-foreground" />
  }
}

export function PassageResults({
  results,
  matched,
  noSource,
  noMatch,
  avgConfidence,
}: PassageResultsProps) {
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
      <div className="flex flex-wrap gap-3">
        <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
          {matched} matched
        </Badge>
        {noSource > 0 && (
          <Badge variant="destructive">{noSource} no source PDF</Badge>
        )}
        {noMatch > 0 && (
          <Badge variant="outline">{noMatch} no passage found</Badge>
        )}
        <Badge variant="secondary">
          Avg confidence: {Math.round(avgConfidence * 100)}%
        </Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-10" />
              <TableHead>Citation</TableHead>
              <TableHead className="w-20 text-center">Thesis p.</TableHead>
              <TableHead>Source file</TableHead>
              <TableHead className="w-20 text-center">Source p.</TableHead>
              <TableHead className="w-24 text-center">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r, idx) => {
              const isExpanded = expandedIds.has(idx)
              return (
                <TableRow key={`${r.citationKey}-${r.thesisPage}`}>
                  <TableCell>
                    <button
                      onClick={() => toggleExpand(idx)}
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
                    <StatusIcon status={r.status} />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleExpand(idx)}
                      className="text-left"
                    >
                      <span className="font-medium text-foreground">
                        {r.citationKey}
                      </span>
                      {isExpanded && (
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Thesis context:
                            </p>
                            <p className="text-xs text-foreground">
                              {r.thesisContext}
                            </p>
                          </div>
                          {r.matchedPassage && (
                            <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
                              <p className="mb-1 text-xs font-medium text-accent-foreground">
                                Matched passage (p.{r.sourcePage}):
                              </p>
                              <p className="text-xs text-foreground">
                                {r.matchedPassage}
                              </p>
                            </div>
                          )}
                          {r.reasoning && (
                            <p className="text-xs italic text-muted-foreground">
                              {r.reasoning}
                            </p>
                          )}
                        </div>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {r.thesisPage}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.filename ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-foreground">
                          {r.filename}
                        </span>
                        {r.referenceLabel && (
                          <span className="text-xs text-muted-foreground">
                            {r.referenceLabel}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {r.sourcePage ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.status === 'matched' ? (
                      <ConfidenceBadge confidence={r.confidence} />
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {r.status === 'no-source' ? 'No PDF' : 'N/A'}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
