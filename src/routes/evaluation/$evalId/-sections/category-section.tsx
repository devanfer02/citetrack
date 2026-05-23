import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
} from '#/lib/evaluation/constants'
import {
  categoryMatchesFilter,
  type ParsedFilter,
} from '#/lib/evaluation/filter'
import type { VocabClassification } from '#/services/evaluation/vocabulary'
import { FindingsTable } from './findings-table'

interface CategorySectionProps {
  category: EvaluationCategory
  findings: EvaluationFinding[]
  filter: ParsedFilter
  isLive: boolean
  liveCount: number | null
  onEvaluationFindingClick?: (page: number, highlight?: string) => void
  vocabMap?: Map<string, VocabClassification>
  onClassify?: (word: string, classification: VocabClassification) => void
}

export function CategorySection({
  category,
  findings,
  filter,
  isLive,
  liveCount,
  onEvaluationFindingClick,
  vocabMap,
  onClassify,
}: CategorySectionProps) {
  const [open, setOpen] = useState(true)

  if (!categoryMatchesFilter(category, filter)) return null

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
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <div>
            <h2 className="text-lg font-semibold">
              {CATEGORY_LABELS[category]}
            </h2>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_DESCRIPTIONS[category]}
            </p>
          </div>
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
            vocabMap={vocabMap}
            onClassify={onClassify}
          />
        </div>
      )}
    </section>
  )
}
