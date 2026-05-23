import { Badge } from '#/components/ui/badge'

interface ConfidenceBadgeProps {
  confidence: number | null
  matchType?: string
}

export function ConfidenceBadge({ confidence, matchType }: ConfidenceBadgeProps) {
  if (matchType === 'unmatched') {
    return <Badge variant="destructive">No match</Badge>
  }
  if (confidence === null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.8) {
    return (
      <Badge className="border-accent/20 bg-accent/10 text-accent-foreground">
        {pct}%
      </Badge>
    )
  }
  if (confidence >= 0.5) {
    return (
      <Badge className="border-secondary/40 bg-secondary/20 text-secondary-foreground">
        {pct}%
      </Badge>
    )
  }
  return <Badge variant="destructive">{pct}%</Badge>
}
