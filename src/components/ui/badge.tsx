import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "#/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/30 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--bg-butter)] border-[var(--marker-yellow)] text-[var(--ink)]",
        secondary:
          "bg-[var(--bg-sky)] border-[var(--marker-sky)] text-[var(--ink)]",
        destructive:
          "bg-[var(--bg-blush)] border-[var(--marker-blush)] text-[var(--ink)]",
        outline:
          "bg-white border-[var(--line)] text-[var(--ink-soft)]",
        ghost:
          "bg-transparent border-transparent text-[var(--ink-soft)]",
        link: "border-transparent text-[var(--accent-indigo-deep)] underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
