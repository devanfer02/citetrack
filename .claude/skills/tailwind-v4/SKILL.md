---
name: tailwind-v4
description: Tailwind CSS v4 patterns for CSS-first configuration, theming, custom variants, utilities, and dark mode. Use when writing or modifying styles, theme tokens, components, or any CSS/Tailwind configuration.
user-invocable: false
---

# Tailwind CSS v4 Reference

Tailwind v4 is CSS-first — no `tailwind.config.js`. All configuration lives in CSS.

## Setup

```css
@import "tailwindcss";
```

Vite plugin in `vite.config.ts`:

```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
});
```

## @theme — Design Tokens

Define tokens that generate both CSS variables and utility classes.

```css
@theme {
  --color-mint-500: oklch(0.72 0.11 178);
  --font-display: "Satoshi", sans-serif;
  --breakpoint-3xl: 120rem;
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
}
```

This creates `bg-mint-500`, `text-mint-500`, `font-display`, `3xl:*`, `ease-snappy`.

### Namespaces → Utilities

| Namespace | Generates |
|-----------|-----------|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `fill-*`, `ring-*` |
| `--font-*` | `font-*` |
| `--text-*` | `text-*` (font size) |
| `--font-weight-*` | `font-*` |
| `--tracking-*` | `tracking-*` |
| `--leading-*` | `leading-*` |
| `--breakpoint-*` | `sm:*`, `md:*`, `lg:*` |
| `--spacing-*` | `p-*`, `m-*`, `gap-*`, `w-*`, `h-*` |
| `--radius-*` | `rounded-*` |
| `--shadow-*` | `shadow-*` |
| `--blur-*` | `blur-*` |
| `--animate-*` | `animate-*` |
| `--ease-*` | `ease-*` |

### Override defaults

```css
@theme {
  --color-*: initial;      /* reset all default colors */
  --color-brand: #3DC2EC;  /* add only what you need */
}
```

Reset everything with `--*: initial`.

### @theme inline — Reference CSS variables

Use `inline` when theme values reference other CSS variables (e.g. for dark mode switching):

```css
:root {
  --app-bg: #ffffff;
}
.dark {
  --app-bg: #0a1418;
}

@theme inline {
  --color-background: var(--app-bg);
}
```

### @theme static — Always emit variables

```css
@theme static {
  --color-primary: var(--color-red-500);
}
```

Forces CSS variable output even if unused in HTML.

## @custom-variant — Custom Variants

```css
@custom-variant dark (&:where(.dark, .dark *));
@custom-variant theme-midnight (&:where([data-theme="midnight"] *));
```

Usage: `dark:bg-black`, `theme-midnight:text-white`.

## @utility — Custom Utilities

```css
@utility tab-4 {
  tab-size: 4;
}
```

Works with all variants: `hover:tab-4`, `lg:tab-4`, `dark:tab-4`.

## @variant — Apply Variants in CSS

```css
.my-element {
  background: white;
  @variant dark {
    background: black;
  }
}
```

## @source — Content Detection

```css
@source "../node_modules/@my-company/ui-lib";
```

Tell Tailwind to scan additional directories for class names.

## @reference — Component Styles (no duplication)

For scoped `<style>` blocks (Vue, Svelte):

```css
@reference "../../app.css";
h1 {
  @apply text-2xl font-bold text-red-500;
}
```

## @plugin — Legacy JS Plugins

```css
@plugin "@tailwindcss/typography";
```

## Colors

### Opacity via slash syntax

```html
<div class="bg-sky-500/50"></div>     <!-- 50% opacity -->
<div class="bg-primary/10"></div>     <!-- 10% opacity -->
```

### --alpha() function in CSS

```css
.element {
  background: --alpha(var(--color-lime-300) / 50%);
}
/* compiles to: color-mix(in oklab, var(--color-lime-300) 50%, transparent) */
```

### Arbitrary colors

```html
<div class="bg-[#1da1f2]"></div>
<div class="text-[oklch(62.3% 0.214 259.815)]"></div>
```

## Spacing

### --spacing() function

```css
.element {
  margin: --spacing(4);
}
/* compiles to: calc(var(--spacing) * 4) */
```

## Dark Mode

Default: `prefers-color-scheme` media query.

### Class-based toggle

```css
@custom-variant dark (&:where(.dark, .dark *));
```

### Three-state (light/dark/system)

```javascript
document.documentElement.classList.toggle(
  "dark",
  localStorage.theme === "dark" ||
    (!("theme" in localStorage) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
);
```

## Using Theme Variables in CSS

```css
@layer components {
  .typography {
    font-size: var(--text-base);
    color: var(--color-gray-700);
  }
}
```

## Using Theme Variables in JS

```javascript
let styles = getComputedStyle(document.documentElement);
let shadow = styles.getPropertyValue("--shadow-xl");
```

## Key Differences from v3

| v3 | v4 |
|----|-----|
| `tailwind.config.js` | `@theme {}` in CSS |
| `plugins: [require('...')]` | `@plugin "..."` |
| `darkMode: 'class'` | `@custom-variant dark (...)` |
| `theme.extend.colors` | `@theme { --color-*: ... }` |
| `theme()` function | `var(--...)` CSS variables |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Content config in JS | Automatic detection + `@source` |
