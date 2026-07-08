import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { EYD_TIPS } from '#/lib/evaluation/constants'

const TIP_ROTATE_MS = 7_000

// "Tahukah kamu" tip rotator. Auto-cycles every 7 s with a fade-and-
// slide entrance keyed on index so each tip animates in fresh.
// Pause/Play button satisfies WCAG 2.2.2 (Pause, Stop, Hide).
export function EydMarginalia() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * EYD_TIPS.length),
  )
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % EYD_TIPS.length)
    }, TIP_ROTATE_MS)
    return () => clearInterval(id)
  }, [isPaused])

  return (
    <aside
      aria-label="Tip EYD"
      className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 border-l-2 border-[color-mix(in_oklab,var(--lagoon-deep)_45%,transparent)] py-1 pl-5"
    >
      <span className="kicker kicker-accent">Tahukah kamu</span>
      <div className="flex flex-col gap-2">
        <p
          key={index}
          aria-live="polite"
          aria-atomic="true"
          className="display-title animate-in fade-in slide-in-from-bottom-2 text-[15px] italic leading-relaxed text-[var(--sea-ink)] duration-500"
        >
          {EYD_TIPS[index]}
        </p>
        <div className="flex items-center gap-2 text-[var(--ink-soft)]">
          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            aria-pressed={isPaused}
            aria-label={isPaused ? 'Lanjutkan rotasi tip' : 'Jeda rotasi tip'}
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent transition-colors hover:border-[var(--line)] hover:text-foreground"
          >
            {isPaused ? (
              <Play className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Pause className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
          <span className="kicker tabular-nums text-[var(--ink-faint)]">
            {index + 1} / {EYD_TIPS.length}
          </span>
        </div>
      </div>
    </aside>
  )
}
