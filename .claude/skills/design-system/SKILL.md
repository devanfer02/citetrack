---
name: design-system
description: Build UI following the TelNetQuiz design system (Tailwind 4, shadcn/ui, Radix UI, CVA, brand tokens). Use when creating components, pages, or layouts, or answering styling, theming, colors, typography, or variant questions.
---

# Design System — TelNetQuiz (Geomatruiz)

This skill guides the creation of visually consistent, accessible UI components
using the established TelNetQuiz design system.

## Tech Stack

| Layer | Tool |
|-------|------|
| CSS Framework | Tailwind CSS 4.0 (inline @theme config) |
| Primitives | Radix UI |
| Component Style | shadcn/ui (new-york variant) |
| Variant Management | class-variance-authority (CVA) |
| Class Merging | clsx + tailwind-merge via `cn()` |
| Icons | Lucide React (544+ icons) |
| Animations | tw-animate-css |
| Color Space | OKLch |

## Brand Tokens

The Telnetquiz brand palette is defined in `src/css/styles.css` under `@theme inline`:

| Token | Value | Usage |
|-------|-------|-------|
| `telnet-primary` | `#f37704` | Primary orange — CTAs, active states |
| `telnet-secondary` | `#8b340d` | Dark brown — headings, emphasis |
| `telnet-tertiary` | `#ff542e` | Red-orange — alerts, highlights |
| `telnet-surface` | `#ffdab7` | Peach — card backgrounds, surfaces |
| `telnet-surface-darker` | `#f9bd85` | Darker peach — hover states |
| `telnet-dark-brown` | `#662500` | Deep brown — footer, dark sections |
| `telnet-path` | `#f5e9b8` | Light yellow — decorative paths |
| `telnet-green-cactus` | `#588432` | Green — success states, nature elements |

Use via Tailwind: `bg-telnet-primary`, `text-telnet-secondary`, `border-telnet-surface`, etc.

## shadcn/ui Theme Tokens

Defined as CSS custom properties in `:root` (light) and `.dark` (dark mode):

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | White | Dark purple | Page background |
| `--foreground` | Dark purple | White | Default text |
| `--primary` | Dark purple | White | Primary actions |
| `--secondary` | Light gray | Dark gray | Secondary elements |
| `--destructive` | Red-orange | — | Delete, danger |
| `--muted` | Light gray | Dark gray | Disabled, placeholder |
| `--accent` | Light gray | Dark gray | Hover highlights |
| `--card` | White | Dark purple | Card backgrounds |
| `--border` | Light gray | Dark gray | Borders |
| `--ring` | Dark purple | Light gray | Focus rings |

Radius: `--radius: 0.625rem` (10px base), with sm/md/lg/xl variants.

## Component Structure

```
src/components/
├── ui/          — Reusable primitives (button, card, input, table, etc.)
├── global/      — App-level shared (sidebar, page-header, flash-banner, etc.)
├── chapters/    — Chapter-specific components
├── questions/   — Question-specific components
├── quiz/        — Quiz-specific components
└── study-materials/  — Study material components
```

### Where to place new components

- **Generic, reusable primitive** → `ui/`
- **App-level shared (used across multiple pages)** → `global/`
- **Feature-specific** → `<feature>/` directory

## Writing a New Component

### Use CVA for variant management

```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const thingVariants = cva(
  "inline-flex items-center rounded-md text-sm font-medium", // base
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-white",
        outline: "border border-input bg-background",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
```

### Use data-slot for semantic hooks

Every component gets a `data-slot` attribute for styling and testing:

```typescript
function ThingCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="thing-card"
      className={cn("rounded-xl border bg-card p-6", className)}
      {...props}
    />
  );
}
```

### Use cn() for class merging

Always use `cn()` (from `src/lib/utils.ts`) to merge classes. It handles Tailwind conflicts:

```typescript
<div className={cn("bg-primary text-white", isActive && "bg-telnet-primary", className)} />
```

### Compound component pattern

For complex components, export sub-components:

```typescript
function ThingCard({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="thing-card" className={cn("rounded-xl border bg-card", className)} {...props} />;
}

function ThingCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="thing-card-header" className={cn("flex items-center gap-2 p-4", className)} {...props} />;
}

function ThingCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="thing-card-content" className={cn("p-4 pt-0", className)} {...props} />;
}

export { ThingCard, ThingCardHeader, ThingCardContent };
```

## Styling Patterns

### Focus states

```
focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-1
```

### Dark mode

Use CSS custom properties — they auto-switch. Don't hardcode light/dark colors:

```typescript
// Good: uses theme tokens
<div className="bg-background text-foreground border-border" />

// Bad: hardcoded
<div className="bg-white text-gray-900 dark:bg-gray-950 dark:text-white" />
```

### Responsive

Mobile-first with Tailwind breakpoints. Use container queries where appropriate:

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" />
```

### Disabled states

```typescript
<button disabled className="disabled:pointer-events-none disabled:opacity-50" />
```

### SVG icon sizing

Icons auto-size within components:

```
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4
```

## Accessibility Checklist

- All interactive elements must have visible focus states (`focus-visible:ring-*`)
- Use semantic HTML (`button` not `div onClick`)
- Include `aria-label` on icon-only buttons
- Color contrast: OKLch tokens are pre-validated for WCAG AA
- Keyboard navigation: Radix primitives handle this — don't override
- Use `data-slot` attributes for test selectors (not CSS classes)

## Import Aliases

```
@/*          → src/
@/components → components/
@/ui         → components/ui/
@/lib        → lib/
@/hooks      → hooks/
```

## Common Mistakes to Avoid

- Don't use raw hex colors — use theme tokens (`bg-telnet-primary` not `bg-[#f37704]`)
- Don't skip `cn()` — direct className concatenation breaks Tailwind merge
- Don't create new primitives when shadcn/ui has one (check `src/components/ui/` first)
- Don't use `dark:` variants — rely on CSS custom properties for theme switching
- Don't forget `data-slot` on new components
- Don't import Radix directly — use the shadcn/ui wrapper in `components/ui/`
