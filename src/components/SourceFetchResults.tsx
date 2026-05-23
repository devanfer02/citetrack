import { Check, Download, ExternalLink, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { SourceFetchResult } from '#/services/sources'

interface SourceFetchResultsProps {
  results: SourceFetchResult[]
  found: number
  failed: number
  total: number
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null
  const labels: Record<string, string> = {
    doi: 'DOI',
    unpaywall: 'Unpaywall',
    'semantic-scholar': 'Semantic Scholar',
    manual: 'Manual',
  }
  return (
    <Badge variant="outline" className="text-xs">
      {labels[source] ?? source}
    </Badge>
  )
}

export function SourceFetchResults({
  results,
  found,
  failed,
  total,
}: SourceFetchResultsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
          <Download className="mr-1 h-3 w-3" />
          {found}/{total} found
        </Badge>
        {failed > 0 && (
          <Badge variant="destructive">
            {failed} not found
          </Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">Status</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="w-28 text-center">Source</TableHead>
              <TableHead className="w-20 text-center">Pages</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.referenceId}>
                <TableCell className="text-center">
                  {r.status === 'done' ? (
                    <Check className="mx-auto h-4 w-4 text-accent-foreground" />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-destructive" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {r.author}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.title.length > 70
                        ? `${r.title.slice(0, 70)}...`
                        : r.title}
                    </span>
                    {r.error && (
                      <span className="text-xs text-destructive">
                        {r.error}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <SourceBadge source={r.fetchSource} />
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {r.totalPages ?? '—'}
                </TableCell>
                <TableCell>
                  {r.pdfUrl && (
                    <a
                      href={r.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1 text-primary hover:bg-primary/10"
                      title="Open PDF"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
