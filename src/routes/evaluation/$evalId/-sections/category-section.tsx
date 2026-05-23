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
  open?: boolean
  onOpenChange?: (open: boolean) => void
  highlighted?: boolean
  onHighlightEnd?: () => void
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
  open: controlledOpen,
  onOpenChange,
  highlighted = false,
  onHighlightEnd,
}: CategorySectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setUncontrolledOpen(next)
  }

  if (!categoryMatchesFilter(category, filter)) return null

  const categoryFindings = findings.filter((f) => f.category === category)
  const errors = categoryFindings.filter((f) => f.severity === 'error').length
  const warnings = categoryFindings.filter(
    (f) => f.severity === 'warning',
  ).length

  return (
    <section
      id={`category-${category}`}
      data-highlight={highlighted ? 'true' : undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'category-flash') onHighlightEnd?.()
      }}
      className="scroll-mt-24 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] data-[highlight=true]:category-flash"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 rounded-t-xl bg-[var(--chip-bg)] px-5 py-4 text-left shadow-[0_1px_0_0_var(--line)] data-[closed=true]:rounded-b-xl data-[closed=true]:shadow-none"
        data-closed={open ? undefined : 'true'}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
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
      <div
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-150 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-5 py-4">
            <FindingsTable
              findings={categoryFindings}
              filter={filter}
              isLive={isLive}
              onEvaluationFindingClick={onEvaluationFindingClick}
              vocabMap={vocabMap}
              onClassify={onClassify}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
