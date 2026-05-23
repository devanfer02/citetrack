import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '#/lib/utils'

export type SectionTone = 'cream' | 'butter' | 'mint' | 'blush' | 'sky'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  tone?: SectionTone
  innerClassName?: string
  children: ReactNode
}

export function Section({
  tone = 'cream',
  className,
  innerClassName,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      data-tone={tone}
      className={cn('section-band w-full', className)}
      {...rest}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-[88rem] px-6 py-12 sm:px-10 sm:py-16',
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  )
}
