import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
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
  const total = categoryFindings.length
  const errors = categoryFindings.filter((f) => f.severity === 'error').length
  const warnings = categoryFindings.filter(
    (f) => f.severity === 'warning',
  ).length
  const infos = categoryFindings.filter((f) => f.severity === 'info').length

  return (
    <section
      id={`category-${category}`}
      data-highlight={highlighted ? 'true' : undefined}
      onAnimationEnd={(e) => {
        if (e.animationName === 'category-flash') onHighlightEnd?.()
      }}
      className="scroll-mt-24 pt-2 data-[highlight=true]:category-flash"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group block w-full text-left focus-visible:outline-none"
      >
        <div className="flex items-baseline justify-between gap-6">
          <div className="flex items-baseline gap-3">
            <span className="kicker kicker-accent">{category}</span>
            <h2
              className="display-title text-3xl font-medium leading-none tracking-tight text-foreground sm:text-[2rem]"
            >
              {CATEGORY_LABELS[category]}
            </h2>
          </div>
          <div className="flex items-baseline gap-3 text-sm text-[var(--sea-ink-soft)]">
            <span className="tabular-nums">
              <span className="display-title text-2xl font-medium text-foreground">
                {isLive && liveCount !== null ? liveCount : total}
              </span>{' '}
              <span className="kicker">temuan</span>
            </span>
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 shrink-0 text-[var(--sea-ink-soft)] transition-transform duration-200 group-hover:text-foreground ${open ? '' : '-rotate-90'}`}
            />
          </div>
        </div>
        <div className="mt-3 editorial-rule" />
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[0.8125rem] text-[var(--sea-ink-soft)]">
          <p className="max-w-prose leading-relaxed">
            {CATEGORY_DESCRIPTIONS[category]}.
          </p>
          <span aria-hidden className="hidden text-[var(--line)] sm:inline">
            ·
          </span>
          <span className="flex items-baseline gap-3 whitespace-nowrap">
            {errors > 0 && (
              <span className="inline-flex items-baseline gap-1.5">
                <span
                  className="severity-dot translate-y-[1px]"
                  data-severity="error"
                />
                <span className="tabular-nums text-foreground">{errors}</span>{' '}
                <span className="kicker">error</span>
              </span>
            )}
            {warnings > 0 && (
              <span className="inline-flex items-baseline gap-1.5">
                <span
                  className="severity-dot translate-y-[1px]"
                  data-severity="warning"
                />
                <span className="tabular-nums text-foreground">{warnings}</span>{' '}
                <span className="kicker">warning</span>
              </span>
            )}
            {infos > 0 && (
              <span className="inline-flex items-baseline gap-1.5">
                <span
                  className="severity-dot translate-y-[1px]"
                  data-severity="info"
                />
                <span className="tabular-nums text-foreground">{infos}</span>{' '}
                <span className="kicker">info</span>
              </span>
            )}
            {isLive && (
              <span className="kicker kicker-accent dots-loop">
                memeriksa<span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            )}
          </span>
        </div>
      </button>
      <div className="mt-5" hidden={!open}>
        <FindingsTable
          findings={categoryFindings}
          filter={filter}
          isLive={isLive}
          onEvaluationFindingClick={onEvaluationFindingClick}
          vocabMap={vocabMap}
          onClassify={onClassify}
        />
      </div>
    </section>
  )
}
