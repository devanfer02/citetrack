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
  { key: 'upload', label: 'Upload', icon: FileText },
  { key: 'citations', label: 'Citations', icon: BookOpen },
  { key: 'references', label: 'References', icon: Library },
  { key: 'matching', label: 'Matching', icon: Link2 },
  { key: 'sources', label: 'Source PDFs', icon: Download },
  { key: 'passages', label: 'Passages', icon: Brain },
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
    <nav className="flex flex-col gap-0.5">
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
        const labelCls = `text-xs font-medium ${
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
          <div key={step.key} className="flex flex-col">
            {isReachable && !isActive ? (
              <button
                type="button"
                onClick={() => onStepClick?.(stepNum)}
                className="flex items-center gap-3 rounded-lg px-1 py-0.5 -ml-1 text-left transition-colors hover:bg-accent/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Go to ${step.label}`}
              >
                {inner}
              </button>
            ) : (
              <div
                className="flex items-center gap-3"
                aria-current={isActive ? 'step' : undefined}
              >
                {inner}
              </div>
            )}

            {idx < STEPS.length - 1 && (
              <div
                className={`ml-[15px] h-4 w-0.5 rounded-full transition-colors ${
                  stepNum < currentStep ? 'bg-accent' : 'bg-border'
                }`}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
