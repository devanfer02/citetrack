import { Link } from '@tanstack/react-router'
import { useIsLocalEnv } from '#/stores/preview-public-mode'

const PUBLIC_NAV = [
  { to: '/', label: 'Beranda' },
  { to: '/evaluation', label: 'Evaluation' },
  { to: '/track', label: 'Track' },
] as const

const LOCAL_ONLY_NAV = [
  { to: '/history', label: 'Riwayat' },
  { to: '/settings', label: 'Setelan' },
  { to: '/admin/api-logs', label: '3rd Party Logs' },
] as const

export default function Header() {
  const isLocalEnv = useIsLocalEnv()
  const navItems = isLocalEnv
    ? [...PUBLIC_NAV, ...LOCAL_ONLY_NAV]
    : PUBLIC_NAV

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

        {!isLocalEnv && (
          <span
            className="severity-badge"
            data-severity="info"
            aria-label="Demo publik"
          >
            Demo publik
          </span>
        )}

        <div className="order-3 ml-auto flex flex-wrap items-center gap-x-7 gap-y-1 text-sm sm:order-2 sm:flex-nowrap">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link"
              activeProps={{
                className: 'nav-link is-active',
                'aria-current': 'page',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  )
}
