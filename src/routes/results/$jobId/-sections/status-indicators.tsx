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
      return (
        <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
          Verified
        </Badge>
      )
    case 'needs-review':
      return (
        <Badge className="border-secondary/40 bg-secondary/20 text-secondary-foreground">
          Needs Review
        </Badge>
      )
    case 'no-source':
      return <Badge variant="destructive">No Source</Badge>
    case 'not-found':
      return <Badge variant="outline">Not Found</Badge>
  }
}
