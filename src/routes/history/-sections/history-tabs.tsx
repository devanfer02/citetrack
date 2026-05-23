import { Link } from '@tanstack/react-router'

const TABS: { kind: HistoryKind; label: string }[] = [
  { kind: 'track', label: 'Track' },
  { kind: 'evaluation', label: 'Evaluation' },
]

export function HistoryTabs({ active }: { active: HistoryKind }) {
  return (
    <div
      role="tablist"
      className="mb-6 inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--chip-bg)] p-1"
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
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
