import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
} from '#/lib/evaluation/constants'
import { FindingsTable } from './findings-table'

interface CategorySectionProps {
  category: EvaluationCategory
  findings: EvaluationFinding[]
  filter: string
  isLive: boolean
  liveCount: number | null
  onEvaluationFindingClick?: (page: number, highlight?: string) => void
}

export function CategorySection({
  category,
  findings,
  filter,
  isLive,
  liveCount,
  onEvaluationFindingClick,
}: CategorySectionProps) {
  const [open, setOpen] = useState(true)
  const categoryFindings = findings.filter((f) => f.category === category)
  const errors = categoryFindings.filter((f) => f.severity === 'error').length
  const warnings = categoryFindings.filter(
    (f) => f.severity === 'warning',
  ).length

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-lg font-semibold">{CATEGORY_LABELS[category]}</h2>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_DESCRIPTIONS[category]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive && liveCount !== null && liveCount > 0 && (
            <Badge variant="outline" className="animate-pulse">
              {liveCount} so far
            </Badge>
          )}
          {errors > 0 && <Badge variant="destructive">{errors} error</Badge>}
          {warnings > 0 && (
            <Badge variant="secondary">{warnings} warning</Badge>
          )}
          {errors === 0 && warnings === 0 && !isLive && (
            <Badge variant="outline">0 issues</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--line)] px-5 py-4">
          <FindingsTable
            findings={categoryFindings}
            filter={filter}
            isLive={isLive}
            onEvaluationFindingClick={onEvaluationFindingClick}
          />
        </div>
      )}
    </section>
  )
}
