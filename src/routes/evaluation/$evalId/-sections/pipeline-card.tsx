import { CheckCircle2, Circle } from 'lucide-react'
import { Progress } from '#/components/ui/progress'
import { STAGES } from '#/lib/evaluation/constants'
import { stageProgress, stageState } from '#/lib/evaluation/utils'

export function PipelineCard({ job }: { job: EvaluationJob }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STAGES.map((stage) => {
        const state = stageState(job, stage.id)
        const progress = stageProgress(job, stage.id)
        const Icon = stage.icon
        const pct = progress ? progress.pct : state === 'done' ? 100 : 0

        return (
          <div
            key={stage.id}
            className={`relative overflow-hidden rounded-xl border px-4 py-4 transition-all ${
              state === 'running'
                ? 'border-primary/40 bg-primary/5 shadow-[0_0_0_3px_rgba(86,198,190,0.08)]'
                : state === 'done'
                  ? 'border-[var(--line)] bg-[var(--chip-bg)]'
                  : 'border-[var(--line)] bg-[var(--chip-bg)]/60 opacity-70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  state === 'done'
                    ? 'bg-accent/15 text-accent-foreground'
                    : state === 'running'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : state === 'running' ? (
                  <Icon className="h-5 w-5 animate-pulse" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  {stage.label}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {stage.description}
                </p>
              </div>
            </div>
            {(state === 'running' || progress) && (
              <div className="mt-3 space-y-1">
                <Progress value={pct} />
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? `Halaman ${progress.processed} dari ${progress.total}`
                    : state === 'running'
                      ? 'Memulai…'
                      : 'Selesai'}
                </p>
              </div>
            )}
            {state === 'done' && !progress && (
              <p className="mt-3 text-xs text-muted-foreground">Selesai</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
