import type { SVGProps } from 'react'

type DoodleTone = 'default' | 'coral' | 'indigo' | 'green' | 'yellow'

interface DoodleProps extends SVGProps<SVGSVGElement> {
  tone?: DoodleTone
  size?: number | string
}

const baseProps = ({
  tone,
  size,
  className,
  ...rest
}: DoodleProps): SVGProps<SVGSVGElement> => ({
  className: ['doodle', className].filter(Boolean).join(' '),
  width: size ?? 24,
  height: size ?? 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  'data-tone': tone === 'default' ? undefined : tone,
  ...rest,
})

export function Squiggle(props: DoodleProps) {
  return (
    <svg viewBox="0 0 64 16" {...baseProps(props)}>
      <path d="M2 8 Q 10 0, 18 8 T 34 8 T 50 8 T 62 8" />
    </svg>
  )
}

export function DottedArc(props: DoodleProps) {
  return (
    <svg viewBox="0 0 64 32" {...baseProps(props)}>
      <path
        d="M2 30 Q 22 -4, 62 14"
        strokeDasharray="1 6"
      />
    </svg>
  )
}

export function Underline(props: DoodleProps) {
  return (
    <svg viewBox="0 0 80 10" {...baseProps(props)}>
      <path d="M2 6 Q 22 0, 40 5 T 78 4" />
    </svg>
  )
}

export function Sparkles(props: DoodleProps) {
  return (
    <svg viewBox="0 0 40 40" {...baseProps(props)}>
      <path d="M10 6 L10 14 M6 10 L14 10" />
      <path d="M28 18 L28 26 M24 22 L32 22" />
      <path d="M18 28 L18 34 M15 31 L21 31" />
    </svg>
  )
}

export function Lightbulb(props: DoodleProps) {
  return (
    <svg viewBox="0 0 40 40" {...baseProps(props)}>
      <path d="M20 8 a8 8 0 0 1 5 14 v3 h-10 v-3 a8 8 0 0 1 5 -14 Z" />
      <path d="M17 30 h6" />
      <path d="M18 33 h4" />
      <path d="M20 4 v2 M8 14 l1.5 1 M32 14 l-1.5 1 M6 22 h2 M32 22 h2" />
    </svg>
  )
}

export function Arrow(props: DoodleProps) {
  return (
    <svg viewBox="0 0 64 32" {...baseProps(props)}>
      <path d="M4 24 Q 16 4, 40 12 Q 50 15, 58 8" />
      <path d="M52 4 L 60 8 L 56 16" />
    </svg>
  )
}

export function StarBurst(props: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" {...baseProps(props)}>
      <path d="M16 4 v6 M16 22 v6 M4 16 h6 M22 16 h6" />
      <path d="M7 7 l4 4 M21 21 l4 4 M7 25 l4 -4 M21 11 l4 -4" />
    </svg>
  )
}

export function PaperPlane(props: DoodleProps) {
  return (
    <svg viewBox="0 0 32 32" {...baseProps(props)}>
      <path d="M4 16 L 28 4 L 20 28 L 16 18 Z" />
      <path d="M16 18 L 28 4" />
    </svg>
  )
}
