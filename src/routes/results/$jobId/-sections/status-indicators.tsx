import { AlertTriangle, BookOpen, FileQuestion, FileX } from 'lucide-react'
import { Badge } from '#/components/ui/badge'

const STATUS_LABELS: Record<CitationTraceRow['status'], string> = {
  verified: 'Terverifikasi',
  'needs-review': 'Perlu ditinjau',
  'no-source': 'Sumber tidak ada',
  'not-found': 'Tidak ditemukan',
}

export function StatusIcon({ status }: { status: CitationTraceRow['status'] }) {
  const label = STATUS_LABELS[status]
  switch (status) {
    case 'verified':
      return (
        <BookOpen
          className="h-4 w-4 text-accent-foreground"
          aria-label={label}
          role="img"
        />
      )
    case 'needs-review':
      return (
        <AlertTriangle
          className="h-4 w-4 text-secondary-foreground"
          aria-label={label}
          role="img"
        />
      )
    case 'no-source':
      return (
        <FileX
          className="h-4 w-4 text-destructive"
          aria-label={label}
          role="img"
        />
      )
    case 'not-found':
      return (
        <FileQuestion
          className="h-4 w-4 text-muted-foreground"
          aria-label={label}
          role="img"
        />
      )
  }
}

// Each badge pairs its icon with the text label so the status is
// communicated by shape + word, not color alone (WCAG 1.4.1).
export function StatusBadge({ status }: { status: CitationTraceRow['status'] }) {
  const label = STATUS_LABELS[status]
  switch (status) {
    case 'verified':
      return (
        <Badge variant="secondary" className="gap-1">
          <BookOpen className="h-3 w-3" aria-hidden="true" />
          {label}
        </Badge>
      )
    case 'needs-review':
      return (
        <Badge variant="default" className="gap-1">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {label}
        </Badge>
      )
    case 'no-source':
      return (
        <Badge variant="destructive" className="gap-1">
          <FileX className="h-3 w-3" aria-hidden="true" />
          {label}
        </Badge>
      )
    case 'not-found':
      return (
        <Badge variant="outline" className="gap-1">
          <FileQuestion className="h-3 w-3" aria-hidden="true" />
          {label}
        </Badge>
      )
  }
}
