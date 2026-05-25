import { Link } from '@tanstack/react-router'
import { isLocalEnv } from '#/env'

const PUBLIC_NAV = [
  { to: '/', label: 'Beranda' },
  { to: '/track', label: 'Track' },
  { to: '/evaluation', label: 'Evaluation' },
] as const

const LOCAL_ONLY_NAV = [
  { to: '/history', label: 'Riwayat' },
  { to: '/settings', label: 'Setelan' },
  { to: '/admin/api-logs', label: '3rd Party Logs' },
] as const

const NAV_ITEMS = isLocalEnv
  ? [...PUBLIC_NAV, ...LOCAL_ONLY_NAV]
  : PUBLIC_NAV

export default function Header() {
  return (
    <header id="app-header" className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg-cream)]/92 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4 sm:px-10 sm:py-5">
        <Link
          to="/"
          className="group inline-flex items-baseline gap-1 no-underline"
          aria-label="CiteTrack, beranda"
        >
          <span className="display-title text-xl font-extrabold tracking-tight text-[var(--ink)] transition-colors group-hover:text-[var(--accent-coral)]">
            Cite
          </span>
          <span className="display-title text-xl font-extrabold tracking-tight text-[var(--accent-coral)]">
            Track
          </span>
        </Link>

        <div className="order-3 ml-auto flex flex-wrap items-center gap-x-7 gap-y-1 text-sm sm:order-2 sm:flex-nowrap">
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
