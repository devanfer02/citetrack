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
}

export function PipelineProgress({ currentStep }: PipelineProgressProps) {
  return (
    <div className="mb-8 flex items-center justify-between gap-1">
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1
        const isCompleted = stepNum < currentStep
        const isActive = stepNum === currentStep
        const Icon = step.icon

        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                  isCompleted
                    ? 'border-accent bg-accent text-accent-foreground'
                    : isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium leading-tight ${
                  isActive
                    ? 'text-primary'
                    : isCompleted
                      ? 'text-accent-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 rounded-full transition-colors ${
                  stepNum < currentStep ? 'bg-accent' : 'bg-border'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
