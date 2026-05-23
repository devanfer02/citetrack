import { Link } from '@tanstack/react-router'

const CURRENT_YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border px-4 pb-14 pt-10 text-muted-foreground">
      <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">
          &copy; {CURRENT_YEAR} CiteTrack. All rights reserved.
        </p>
        <div className="flex items-center gap-5 text-sm">
          <Link
            to="/privacy"
            className="text-muted-foreground no-underline hover:text-foreground"
          >
            Privacy
          </Link>
          <span className="island-kicker m-0">Citation Tracer</span>
        </div>
      </div>
    </footer>
  )
}
