import { AlertTriangle, BookOpen, FileQuestion, FileX } from 'lucide-react'
import { Badge } from '#/components/ui/badge'

export function StatusIcon({ status }: { status: CitationTraceRow['status'] }) {
  switch (status) {
    case 'verified':
      return <BookOpen className="h-4 w-4 text-accent-foreground" />
    case 'needs-review':
      return <AlertTriangle className="h-4 w-4 text-secondary-foreground" />
    case 'no-source':
      return <FileX className="h-4 w-4 text-destructive" />
    case 'not-found':
      return <FileQuestion className="h-4 w-4 text-muted-foreground" />
  }
}

export function StatusBadge({ status }: { status: CitationTraceRow['status'] }) {
  switch (status) {
    case 'verified':
      return <Badge variant="secondary">Verified</Badge>
    case 'needs-review':
      return <Badge variant="default">Needs Review</Badge>
    case 'no-source':
      return <Badge variant="destructive">No Source</Badge>
    case 'not-found':
      return <Badge variant="outline">Not Found</Badge>
  }
}
