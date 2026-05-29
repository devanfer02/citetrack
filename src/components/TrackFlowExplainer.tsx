import { ArrowRight } from 'lucide-react'
import { TRACK_STEPS, type TrackStepTone } from '#/lib/pipeline/track-flow'

const STEP_BG: Record<TrackStepTone, string> = {
  mint: 'bg-[var(--bg-mint)]',
  sky: 'bg-[var(--bg-sky)]',
  butter: 'bg-[var(--bg-butter)]',
  blush: 'bg-[var(--bg-blush)]',
}

const STEP_BORDER: Record<TrackStepTone, string> = {
  mint: 'border-[color-mix(in_oklab,var(--marker-green)_55%,var(--line))]',
  sky: 'border-[color-mix(in_oklab,var(--marker-sky)_55%,var(--line))]',
  butter: 'border-[color-mix(in_oklab,var(--marker-yellow)_55%,var(--line))]',
  blush: 'border-[color-mix(in_oklab,var(--marker-blush)_55%,var(--line))]',
}

interface TrackFlowExplainerProps {
  className?: string
}

export function TrackFlowExplainer({ className }: TrackFlowExplainerProps) {
  return (
    <section
      id="cara-kerja"
      className={`soft-card scroll-mt-24 border-[var(--ink)]/85! px-6 py-7 shadow-[5px_5px_0_0_var(--ink)]! sm:px-8 ${className ?? ''}`}
      data-tone="cream"
      aria-label="Cara CiteTrack melacak sitasi"
    >
      <h2 className="display-title text-lg font-bold leading-snug text-[var(--ink)]">
        Bagaimana sitasi ditelusuri
      </h2>
      <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        CiteTrack bekerja dalam enam langkah, dari unggah skripsi sampai menemukan
        kalimat di paper sumber. Di tiap langkah kamu meninjau hasilnya dulu sebelum
        lanjut — tidak ada yang berjalan otomatis sampai akhir.
      </p>

      <ol className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {TRACK_STEPS.map((step, index) => (
          <li
            key={step.n}
            className="flex flex-col sm:flex-1 sm:flex-row sm:items-center"
          >
            <div
              className={`relative flex-1 rounded-2xl border px-2.5 pb-3.5 pt-6 text-center shadow-[3px_3px_0_0_color-mix(in_oklab,var(--ink)_12%,transparent)] ${STEP_BG[step.tone]} ${STEP_BORDER[step.tone]}`}
            >
              <span
                className="absolute -top-3.5 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-white text-xs font-bold text-[var(--ink)] shadow-[2px_2px_0_0_var(--ink)]"
                aria-hidden="true"
              >
                {step.n}
              </span>
              <span className="sr-only">Langkah {step.n}: </span>
              <span className="block text-sm font-bold leading-tight text-[var(--ink)]">
                {step.short}
              </span>
              <span className="mt-1 block text-xs leading-snug text-[var(--ink-soft)]">
                {step.desc}
              </span>
            </div>
            {index < TRACK_STEPS.length - 1 && (
              <span
                className="flex items-center justify-center py-1.5 text-[var(--ink-faint)] sm:px-1 sm:py-0"
                aria-hidden="true"
              >
                <ArrowRight
                  className="size-5 rotate-90 sm:rotate-0"
                  strokeWidth={2.5}
                />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex justify-between text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--ink-faint)]">
        <span>otomatis · dari skripsimu</span>
        <span>menjangkau paper sumber</span>
      </div>

      <dl className="mt-7 flex flex-col gap-3.5 border-t border-[var(--line)] pt-6">
        {TRACK_STEPS.map((step) => (
          <div key={step.n} className="flex gap-3">
            <dt
              className={`flex size-6 flex-none items-center justify-center rounded-full border-2 border-[var(--ink)] text-[0.6875rem] font-bold text-[var(--ink)] ${STEP_BG[step.tone]}`}
            >
              {step.n}
            </dt>
            <dd className="text-[0.875rem] leading-relaxed text-[var(--ink-soft)]">
              <span className="font-bold text-[var(--ink)]">{step.title}.</span>{' '}
              {step.detail}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 rounded-xl bg-[var(--bg-butter)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--ink)]">
        Tiap langkah punya penanda tahap di bagian atas halaman. Begitu sebuah
        langkah selesai, kamu bisa membukanya lagi kapan saja lewat penanda itu —
        tanpa mengulang dari awal.
      </p>
    </section>
  )
}
