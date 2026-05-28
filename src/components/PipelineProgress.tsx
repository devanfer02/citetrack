import { Fragment } from 'react'
import {
  Check,
  FileText,
  BookOpen,
  Library,
  Link2,
  Download,
  Brain,
} from 'lucide-react'

const STEPS = [
  { key: 'upload', label: 'Unggah', icon: FileText },
  { key: 'citations', label: 'Sitasi', icon: BookOpen },
  { key: 'references', label: 'Pustaka', icon: Library },
  { key: 'matching', label: 'Cocokkan', icon: Link2 },
  { key: 'sources', label: 'PDF sumber', icon: Download },
  { key: 'passages', label: 'Kalimat', icon: Brain },
] as const

interface PipelineProgressProps {
  currentStep: number
  maxReachedStep?: number
  onStepClick?: (step: number) => void
}

export function PipelineProgress({
  currentStep,
  maxReachedStep = currentStep,
  onStepClick,
}: PipelineProgressProps) {
  return (
    <nav className="flex items-start gap-2 sm:gap-3">
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1
        const isCompleted = stepNum < currentStep
        const isActive = stepNum === currentStep
        const isReachable = Boolean(onStepClick) && stepNum <= maxReachedStep
        const Icon = step.icon

        const circleCls = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          isCompleted
            ? 'border-accent bg-accent text-accent-foreground'
            : isActive
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-muted text-muted-foreground'
        }`
        const labelCls = `text-[0.6875rem] sm:text-xs font-medium text-center leading-tight ${
          isActive
            ? 'text-primary'
            : isCompleted
              ? 'text-accent-foreground'
              : 'text-muted-foreground'
        }`

        const inner = (
          <>
            <div className={circleCls}>
              {isCompleted ? (
                <Check className="h-4 w-4" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </div>
            <span className={labelCls}>{step.label}</span>
          </>
        )

        return (
          <Fragment key={step.key}>
            {isReachable && !isActive ? (
              <button
                type="button"
                onClick={() => onStepClick?.(stepNum)}
                className="flex flex-col items-center gap-1.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Buka tahap ${step.label}`}
              >
                {inner}
              </button>
            ) : (
              <div
                className="flex flex-col items-center gap-1.5"
                aria-current={isActive ? 'step' : undefined}
              >
                {inner}
              </div>
            )}

            {idx < STEPS.length - 1 && (
              <div
                className={`mt-4 h-0.5 flex-1 rounded-full transition-colors ${
                  stepNum < currentStep ? 'bg-accent' : 'bg-border'
                }`}
              />
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
