import { Link } from '@tanstack/react-router'
import { isLocalEnv } from '#/env'

const PUBLIC_NAV = [
  { to: '/track', label: 'Track' },
  { to: '/evaluation', label: 'Evaluation' },
] as const

const LOCAL_ONLY_NAV = [
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
] as const

const NAV_ITEMS = isLocalEnv
  ? [...PUBLIC_NAV, ...LOCAL_ONLY_NAV]
  : PUBLIC_NAV

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)]/85 backdrop-blur-md px-6 sm:px-8 lg:px-12">
      <nav className="page-wrap flex flex-wrap items-baseline gap-x-8 gap-y-2 py-4 sm:py-5">
        <Link
          to="/"
          className="group inline-flex items-baseline gap-2 no-underline"
          aria-label="CiteTrack, halaman utama"
        >
          <span className="display-title text-lg font-medium tracking-tight text-[var(--sea-ink)] transition-colors group-hover:text-[var(--lagoon-deep)]">
            CiteTrack
          </span>
        </Link>

        <div className="order-3 ml-auto flex flex-wrap items-baseline gap-x-7 gap-y-1 text-sm sm:order-2 sm:flex-nowrap">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  )
}
