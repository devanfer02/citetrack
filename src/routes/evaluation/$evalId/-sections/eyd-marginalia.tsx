import { useEffect, useState } from 'react'
import { EYD_TIPS } from '#/lib/evaluation/constants'

const TIP_ROTATE_MS = 12_000

export function EydMarginalia() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * EYD_TIPS.length),
  )

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % EYD_TIPS.length),
      TIP_ROTATE_MS,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <aside className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 border-l-2 border-[color-mix(in_oklab,var(--lagoon-deep)_45%,transparent)] py-1 pl-5">
      <span className="kicker kicker-accent">Tahukah kamu</span>
      <p
        key={index}
        className="display-title text-[15px] italic leading-relaxed text-[var(--sea-ink)] transition-opacity duration-500"
      >
        {EYD_TIPS[index]}
      </p>
    </aside>
  )
}
