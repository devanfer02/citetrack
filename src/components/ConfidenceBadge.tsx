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
    return <Badge variant="secondary">{pct}%</Badge>
  }
  if (confidence >= 0.5) {
    return <Badge variant="default">{pct}%</Badge>
  }
  return <Badge variant="destructive">{pct}%</Badge>
}
