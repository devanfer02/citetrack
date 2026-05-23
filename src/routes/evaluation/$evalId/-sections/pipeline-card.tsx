import { STAGES } from '#/lib/evaluation/constants'
import { stageProgress, stageState } from '#/lib/evaluation/utils'

const STATUS_COPY: Record<
  'waiting' | 'running' | 'done',
  { en: string; id: string }
> = {
  waiting: { en: 'Waiting', id: 'Menunggu giliran' },
  running: { en: 'In progress', id: 'Sedang berjalan' },
  done: { en: 'Done', id: 'Selesai' },
}

export function PipelineCard({ job }: { job: EvaluationJob }) {
  return (
    <section
      aria-label="Evaluation pipeline"
      className="grid gap-x-10 gap-y-6 sm:grid-cols-3"
    >
      {STAGES.map((stage, idx) => {
        const state = stageState(job, stage.id)
        const progress = stageProgress(job, stage.id)
        const pct = progress ? progress.pct : state === 'done' ? 100 : 0
        const detail =
          progress != null
            ? `Halaman ${progress.processed} dari ${progress.total}`
            : state === 'running'
              ? 'Memulai…'
              : state === 'done'
                ? STATUS_COPY.done.id
                : STATUS_COPY.waiting.id

        return (
          <div key={stage.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="kicker text-[var(--sea-ink-soft)]/70"
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="kicker kicker-accent">{stage.label}</span>
              </div>
              <span
                className="kicker text-[var(--sea-ink-soft)]/70"
                aria-hidden={state !== 'running'}
              >
                {state === 'running' ? `${pct}%` : STATUS_COPY[state].en}
              </span>
            </div>
            <div
              className="stage-progress"
              data-state={state}
              style={{ '--pct': `${pct}%` } as React.CSSProperties}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${stage.label} progress`}
            />
            <p className="text-[0.8125rem] leading-snug text-[var(--sea-ink-soft)]">
              <span className="text-foreground">{stage.description}.</span>{' '}
              <span aria-live="polite">{detail}</span>
            </p>
          </div>
        )
      })}
    </section>
  )
}
