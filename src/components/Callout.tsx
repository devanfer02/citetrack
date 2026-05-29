import { type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '#/lib/utils'

export type CalloutSeverity = 'error' | 'warning' | 'info'

const TONE: Record<CalloutSeverity, { box: string; icon: string }> = {
  error: {
    box: 'border-[color-mix(in_oklab,var(--marker-blush)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-blush)_70%,#ffffff)]',
    icon: 'text-[var(--accent-coral-deep)]',
  },
  warning: {
    box: 'border-[color-mix(in_oklab,var(--marker-yellow)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-butter)_70%,#ffffff)]',
    icon: 'text-[var(--accent-coral-deep)]',
  },
  info: {
    box: 'border-[color-mix(in_oklab,var(--marker-sky)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-sky)_70%,#ffffff)]',
    icon: 'text-[var(--accent-indigo-deep)]',
  },
}

const DEFAULT_ICON: Record<CalloutSeverity, typeof AlertTriangle> = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
}

export function Callout({
  severity = 'info',
  icon,
  title,
  children,
  className,
}: {
  severity?: CalloutSeverity
  icon?: ReactNode
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const tone = TONE[severity]
  const DefaultIcon = DEFAULT_ICON[severity]
  return (
    <div
      role={severity === 'error' ? 'alert' : 'note'}
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border px-4 py-3',
        tone.box,
        className,
      )}
    >
      {icon === undefined ? (
        <DefaultIcon
          className={cn('mt-0.5 size-4 shrink-0', tone.icon)}
          strokeWidth={1.75}
        />
      ) : (
        icon && <span className={cn('mt-0.5 shrink-0', tone.icon)}>{icon}</span>
      )}
      <div className="min-w-0 text-[0.875rem] leading-relaxed text-[var(--ink)]">
        {title && <p className="font-semibold text-[var(--ink)]">{title}</p>}
        {children}
      </div>
    </div>
  )
}
