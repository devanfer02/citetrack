import { Link } from '@tanstack/react-router'

const TABS: { kind: HistoryKind; label: string }[] = [
  { kind: 'track', label: 'Citation Tracer' },
  { kind: 'evaluation', label: 'Evaluation' },
]

export function HistoryTabs({ active }: { active: HistoryKind }) {
  return (
    <nav
      role="tablist"
      aria-label="Riwayat"
      className="mb-8 flex items-baseline gap-x-7 border-b border-[var(--line)] pb-3"
    >
      {TABS.map((tab) => {
        const isActive = tab.kind === active
        return (
          <Link
            key={tab.kind}
            role="tab"
            aria-selected={isActive}
            to="/history"
            search={{ kind: tab.kind, page: 1 }}
            className={`group relative inline-flex items-baseline gap-1.5 pb-1 text-sm transition-colors ${
              isActive
                ? 'font-medium text-foreground'
                : 'text-[var(--sea-ink-soft)] hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            <span
              aria-hidden
              className={`absolute -bottom-[calc(0.75rem+1px)] left-0 h-px w-full origin-left bg-[var(--sea-ink)] transition-transform duration-200 ${
                isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
              }`}
            />
          </Link>
        )
      })}
    </nav>
  )
}
