import { Link } from '@tanstack/react-router'
import { Squiggle } from '#/components/doodles'

const CURRENT_YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer id="app-footer" className="site-footer relative mt-24 px-6 pb-14 pt-12 text-[var(--ink-soft)] sm:px-10">
      <Squiggle
        tone="coral"
        size={56}
        className="absolute right-10 top-6 opacity-50"
      />
      <div className="mx-auto flex max-w-[88rem] flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
        <div className="flex flex-col gap-1">
          <p className="display-title m-0 text-base text-[var(--ink)]">
            CiteTrack
          </p>
          <p className="m-0 text-sm">
            &copy; {CURRENT_YEAR} CiteTrack. All rights reserved.
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link
            to="/privacy"
            className="text-[var(--ink-soft)] no-underline hover:text-[var(--accent-coral-deep)]"
          >
            Privacy
          </Link>
          <span className="island-kicker m-0">Citation Tracer</span>
        </div>
      </div>
    </footer>
  )
}
