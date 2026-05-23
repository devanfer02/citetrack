import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "#/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent-coral)] text-white shadow-[0_4px_12px_rgba(240,115,74,0.25)] hover:bg-[var(--accent-coral-deep)] hover:-translate-y-px",
        destructive:
          "bg-[var(--accent-coral-deep)] text-white hover:bg-[var(--accent-coral)] focus-visible:ring-[var(--accent-coral)]/40",
        outline:
          "border border-[var(--line-strong)] bg-white text-[var(--ink)] hover:bg-[var(--bg-cream)] hover:border-[var(--accent-coral)]",
        secondary:
          "bg-[var(--accent-indigo)] text-white shadow-[0_4px_12px_rgba(61,110,230,0.22)] hover:bg-[var(--accent-indigo-deep)] hover:-translate-y-px",
        ghost:
          "text-[var(--ink)] hover:bg-[var(--bg-cream)] hover:text-[var(--accent-coral-deep)]",
        link: "text-[var(--accent-indigo-deep)] underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 px-7 text-[0.9375rem] has-[>svg]:px-5",
        icon: "size-9 rounded-full",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
