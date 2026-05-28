import { Link, type ErrorComponentProps } from '@tanstack/react-router'

const FACES = [
  '(｡•́︿•̀｡)',
  '(>︿<｡)',
  '(｡T ω T｡)',
  '(˃ ⌑ ˂ഃ )',
  '( •̥́ ﹏ •̥̀)',
] as const

function pickFace(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return FACES[Math.abs(hash) % FACES.length]
}

export default function ErrorPage({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error)
  const face = pickFace(message || 'oops')

  return (
    <main id="main-content" className="page-wrap flex min-h-[60vh] flex-col items-center justify-center gap-8 py-16 text-center">
      <div
        aria-hidden
        className="select-none font-mono text-5xl leading-none text-[var(--sea-ink-soft)] sm:text-6xl"
      >
        {face}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="island-kicker">oh no</p>
        <h1 className="display-title m-0 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Something went a little sideways
        </h1>
        <p className="m-0 max-w-prose text-pretty text-muted-foreground">
          It's not you, it's us. Take a breath, try again, or head back home.
        </p>
      </div>

      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 text-left shadow-[0_8px_24px_rgba(13,61,79,0.06)]">
        <p className="island-kicker m-0 mb-2 text-destructive/80">
          the pesky details
        </p>
        <p className="m-0 break-words font-mono text-sm text-destructive">
          {message || 'Unknown error'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(61,194,236,0.28)] transition-colors hover:bg-[var(--lagoon-deep)]"
        >
          Try again
        </button>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--chip-bg)] px-5 py-2.5 text-sm font-semibold text-foreground no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] transition-colors hover:bg-[var(--link-bg-hover)]"
        >
          Take me home
        </Link>
      </div>
    </main>
  )
}
