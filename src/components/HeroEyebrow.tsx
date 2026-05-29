import { ArrowDown } from 'lucide-react'
import { StarBurst } from '#/components/doodles'
import { Button } from '#/components/ui/button'

interface HeroEyebrowProps {
  label: string
  // When set, renders a "Cara kerja" pill that jumps to the given anchor.
  // Pass null/undefined to hide it (e.g. when the target section isn't on the
  // page in the current phase).
  howItWorksHref?: string | null
}

export function HeroEyebrow({ label, howItWorksHref }: HeroEyebrowProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-coral-deep)]">
        <StarBurst tone="coral" size={14} />
        {label}
      </span>
      {howItWorksHref ? (
        <Button
          asChild
          variant="outline"
          size="xs"
          className="px-3.5 font-bold uppercase tracking-wider text-[var(--ink-soft)] has-[>svg]:px-3.5"
        >
          <a href={howItWorksHref}>
            Cara kerja
            <ArrowDown strokeWidth={2.5} />
          </a>
        </Button>
      ) : null}
    </div>
  )
}
