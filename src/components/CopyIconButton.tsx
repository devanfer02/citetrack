import { type MouseEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useCopyToClipboard } from '#/hooks/use-copy-to-clipboard'

const CHECK_TONE = {
  coral: 'text-[var(--accent-coral-deep)]',
  indigo: 'text-[var(--accent-indigo-deep)]',
} as const

export function CopyIconButton({
  text,
  idleLabel,
  copiedLabel,
  tone = 'coral',
  className,
  stopPropagation = false,
}: {
  text: string
  idleLabel: string
  copiedLabel: string
  tone?: keyof typeof CHECK_TONE
  className?: string
  stopPropagation?: boolean
}) {
  const { copied, copy } = useCopyToClipboard()

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (stopPropagation) e.stopPropagation()
    void copy(text)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? copiedLabel : idleLabel}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40',
        className,
      )}
    >
      {copied ? (
        <Check className={cn('size-3.5', CHECK_TONE[tone])} strokeWidth={2} />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.75} />
      )}
    </button>
  )
}
