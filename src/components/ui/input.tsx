import * as React from "react"

import { cn } from "#/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3.5 py-1 text-sm text-[var(--ink)] transition-[color,box-shadow,border-color] outline-none selection:bg-[var(--marker-yellow)] selection:text-[var(--ink)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ink)] placeholder:text-[var(--ink-faint)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[var(--accent-coral)] focus-visible:ring-[3px] focus-visible:ring-[var(--accent-coral)]/25",
        "aria-invalid:border-[var(--accent-coral-deep)] aria-invalid:ring-[var(--accent-coral)]/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
