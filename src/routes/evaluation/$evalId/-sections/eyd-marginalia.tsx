import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { EYD_TIPS } from '#/lib/evaluation/constants'

const TIP_ROTATE_MS = 12_000

// "Tahukah kamu" tip rotator. Auto-cycles every 12 s; respects WCAG
// 2.2.2 Pause, Stop, Hide via a pause toggle plus prev/next arrows.
// Also pauses when the user hovers or focuses the panel so reading
// isn't interrupted by an auto-advance.
export function EydMarginalia() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * EYD_TIPS.length),
  )
  const [isPaused, setIsPaused] = useState(false)
  const isHoveredRef = useRef(false)

  useEffect(() => {
    if (isPaused) return
    const id = setInterval(() => {
      if (isHoveredRef.current) return
      setIndex((i) => (i + 1) % EYD_TIPS.length)
    }, TIP_ROTATE_MS)
    return () => clearInterval(id)
  }, [isPaused])

  const goPrev = () =>
    setIndex((i) => (i - 1 + EYD_TIPS.length) % EYD_TIPS.length)
  const goNext = () => setIndex((i) => (i + 1) % EYD_TIPS.length)

  return (
    <aside
      aria-label="Tip EYD"
      onMouseEnter={() => {
        isHoveredRef.current = true
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false
      }}
      onFocusCapture={() => {
        isHoveredRef.current = true
      }}
      onBlurCapture={() => {
        isHoveredRef.current = false
      }}
      className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 border-l-2 border-[color-mix(in_oklab,var(--lagoon-deep)_45%,transparent)] py-1 pl-5"
    >
      <span className="kicker kicker-accent">Tahukah kamu</span>
      <div className="flex flex-col gap-2">
        <p
          key={index}
          aria-live="polite"
          aria-atomic="true"
          className="display-title text-[15px] italic leading-relaxed text-[var(--sea-ink)] transition-opacity duration-500"
        >
          {EYD_TIPS[index]}
        </p>
        <div className="flex items-center gap-1 text-[var(--ink-soft)]">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Tip sebelumnya"
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent transition-colors hover:border-[var(--line)] hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
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
          <button
            type="button"
            onClick={goNext}
            aria-label="Tip berikutnya"
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent transition-colors hover:border-[var(--line)] hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="kicker tabular-nums text-[var(--ink-faint)]">
            {index + 1} / {EYD_TIPS.length}
          </span>
        </div>
      </div>
    </aside>
  )
}
