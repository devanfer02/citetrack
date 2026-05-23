import type { ReactNode } from 'react'

export type AccentTone = 'coral' | 'indigo' | 'deep'
export type MarkerTone = 'green' | 'yellow' | 'blush' | 'sky'

interface ColorAccentProps {
  children: ReactNode
  tone?: AccentTone
}

export function AccentInk({ children, tone = 'coral' }: ColorAccentProps) {
  return (
    <span className="accent-ink" data-tone={tone === 'coral' ? undefined : tone}>
      {children}
    </span>
  )
}

interface MarkerProps {
  children: ReactNode
  tone?: MarkerTone
}

export function Marker({ children, tone = 'green' }: MarkerProps) {
  return (
    <mark className="marker" data-tone={tone === 'green' ? undefined : tone}>
      {children}
    </mark>
  )
}
