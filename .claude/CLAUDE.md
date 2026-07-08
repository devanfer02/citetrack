# CLAUDE.md

**MANDATORY** — Every rule below is a hard constraint, not a suggestion. Violating any rule is a build-breaking error. Before writing or modifying any code, re-read the relevant rules. If a rule says "forbidden", treat it as if the linter will reject it. No exceptions unless the rule explicitly defines one.

## Rules (STRICTLY ENFORCED)

### Code Style

- Don't add unnecessary comments
- Use Bun to manage packages and dev tooling
- No `any` or `unknown` — always use precise types. Only use `any`/`unknown` when strictly unavoidable (e.g. third-party lib gaps, type assertion boundaries) and add a `// eslint-disable-next-line` comment explaining why.

### Don't Truncate Content the User Might Need

**DO NOT TRUNCATE CONTENT THAT THE USER MIGHT NEED.** Applies everywhere user-visible text is rendered — UI cells, tables, tooltips, exported PDFs / spreadsheets / CSVs, downloads, copy-to-clipboard payloads, share previews, error banners, anywhere.

- **Wrap, don't cut.** If a line is too wide, break to the next line. If a column is too narrow, let the cell grow vertically. If a page is too short, flow to the next page. Never replace meaning with `…` / `...` / "show more".
- **Show all items, not a sample.** Don't cap lists at N with "… and K more". The reader opened the artifact because they want every entry — show every entry. Pagination is fine where it exists for performance; silent omission is not.
- **Exceptions** (the only ones):
  - Decorative or duplicative metadata (file extensions in a column whose header is "Type", relative-time strings ≤ 1 line).
  - Inputs the user actively typed (an `<input maxlength>` is the user's own constraint).
  - Hard physical limits where the alternative is worse (a 1-line `<title>` for SEO, a single-line OS notification). In those cases, prefer a tooltip / hover / "click for full" rather than silent `…`.
- **PDF / exported artifacts**: messages, citations, finding text, etc. must wrap across lines; lists of findings must show every finding even if the cover spans more pages. Never cap a page-finding list at N and append "… X lainnya".
- **If in doubt, wrap.** The cost of one extra line is tiny. The cost of a missing word in a thesis-evaluation report is the student not knowing why their writing was flagged.

### Documentation Lookup

Always check context7 MCP (`resolve-library-id` then `query-docs`) for up-to-date documentation before implementing with TanStack libraries (Start, Router, Query, Form) — don't rely on training knowledge alone as APIs change frequently.

### Serena MCP

Use Serena MCP for semantic code operations:

- Use `get_symbols_overview` to get a token-efficient overview of symbols in a file before reading full bodies
- Use `find_symbol` with `include_body=False` first to locate symbols, then `include_body=True` only for the ones you need
- Use `find_referencing_symbols` to trace call sites and understand how symbols are used across the codebase
- Use `replace_symbol_body` for precise edits to functions, classes, or methods instead of line-based editing
- Use `insert_before_symbol` / `insert_after_symbol` to add new code at specific positions relative to existing symbols
- Use `rename_symbol` for safe cross-codebase renames
- Use `search_for_pattern` for flexible regex search when you don't know the symbol name
- Prefer Serena's symbolic tools over reading entire files — read symbol bodies only when needed

### State Management

No `useState` or `useEffect` — use TanStack Query for server state and Zustand for global client state. For local component state, prefer TanStack Form (for form fields) or derived/computed values. Only use `useState`/`useEffect` when no TanStack or Zustand alternative exists.

### Color System

Always use CSS custom properties defined in `src/styles.css` and their Tailwind mappings. Never hardcode colors in components:

- **Surface tones** (the Learny pastel system): `var(--bg-cream)`, `var(--bg-butter)`, `var(--bg-mint)`, `var(--bg-blush)`, `var(--bg-sky)`. Use these inside `<Section tone="...">` from `#/components/Section`; never set raw pastel hexes on a div.
- **Ink**: `var(--ink)` for body and headlines (near-black, not pure), `var(--ink-soft)` for secondary text, `var(--ink-faint)` for separator dots / faint metadata.
- **Accent CTAs**: `var(--accent-coral)` / `var(--accent-coral-deep)` (primary), `var(--accent-indigo)` / `var(--accent-indigo-deep)` (secondary). Use through the `Button` primitive; don't hand-roll filled buttons.
- **Marker accents**: `var(--marker-green)`, `var(--marker-yellow)`, `var(--marker-blush)`, `var(--marker-sky)` — only used by `<Marker tone="...">` from `#/components/AccentWord` to wrap one word in a headline.
- **Shadcn semantic tokens** (`bg-primary`, `text-destructive`, `bg-secondary`, `text-muted-foreground`, `bg-accent`, `border-border`) all point at the Learny palette and remain valid in shadcn primitives.
- **Severity**: errors → `bg-[var(--bg-blush)]` + `[data-severity='error']`, warnings → `var(--bg-butter)`, info → `var(--bg-sky)`. The `.severity-badge` / `.severity-dot` classes already pick the right tone via `data-severity`.
- **Legacy aliases**: `var(--sea-ink)`, `var(--lagoon)`, `var(--palm)`, `var(--sand)`, `var(--foam)` still resolve (they alias to the new palette) so older markup keeps rendering, but new code should use the names above.
- **Forbidden**: raw `#hex`, `rgb()`, `rgba()` values in component files; Tailwind color names like `emerald-*`, `amber-*`, `red-*`, `green-*` — use the tokens above instead.
- **Exception**: `src/styles.css` itself, the doodle SVG components, and decorative shadow values inside `box-shadow` may use raw colors.

### Tailwind CSS v4

This project uses Tailwind v4, which differs significantly from v3:

- Use native CSS for theming: CSS custom properties in `@theme inline {}`, not `tailwind.config.js`
- Colors can be any CSS format (hex, rgb, hsl, oklch) — no need to convert between formats
- Use `@custom-variant` for custom variants (e.g. `@custom-variant dark (&:is(.dark *))`)
- Use `@plugin` instead of `plugins: []` in config
- Use `@theme inline {}` to map CSS variables to Tailwind utility classes
- Always check context7 for Tailwind v4 docs before writing Tailwind config — v3 patterns will not work

### Relative Units in Styles

Prefer relative units in CSS/Tailwind over absolute `px`. Relative units (`rem`, `vh`, `vw`, `%`, `em`) scale with the viewport, the user's root font size, or the parent container — which is what "responsive design" actually means under the hood. Pixel values lock a layout to a single assumed screen; a thesis reviewer on a 27" monitor and a student on a 13" laptop should not get the same absolute widths.

- **Default**: `rem` for spacing and typography; `vh` / `vw` for viewport-relative sizing; `%` for proportional layout inside a parent.
- **Tailwind utilities** (`p-4`, `text-lg`, `gap-6`, `max-w-7xl`) are already rem-based. Reach for them first — they're the preferred tool and they avoid arbitrary values entirely.
- **Arbitrary values in `[...]`**: when you need one, use a relative unit. Write `max-w-[100rem]`, `h-[60vh]`, `min-w-[12.5rem]`, not `max-w-[1600px]`, `h-[600px]`, `min-w-[200px]`.
- **`px` is reserved for optical / hairline details**: borders (`border-2`), focus rings (`ring-[3px]`), 1–2px alignment nudges (`translate-y-[2px]`), and shadow offsets inside `box-shadow` (`shadow-[0_8px_24px_rgba(...)]`). These are decorative where px is the conventional, correct unit — and where a `rem` equivalent would be strange.
- **Shadcn UI primitives** under `src/components/ui/` ship with px for focus rings and fine alignment. Don't modify them unless you're intentionally restyling the entire library.
- **If you're tempted to reach for px for a layout width, height, or min/max dimension**: convert to rem (`1rem = 16px`), vh/vw, or a percentage. `1600px` → `100rem`, `520px` → `32.5rem`, `600px` → `60vh` if that's what you actually want.

### Zod Validation

Use Zod schemas for all runtime validation:

- Server function `inputValidator` (can pass Zod schema directly via `@tanstack/zod-adapter`)
- Form validation (TanStack Form supports Zod natively)
- API response parsing from external services
- Define shared schemas in `src/schemas/` when reused across client and server
- Derive TypeScript types with `z.infer<>` from Zod schemas — don't duplicate types manually
- **Exception**: pure internal interfaces (component props, service return types) that are never validated at runtime can use plain `interface`/`type`

### Environment Variables

t3-env for all environment variables — never use raw `process.env` outside of `src/env.ts`. All env vars must be:

- Declared in `src/env.ts` with Zod validation (required fields use `z.string().min(1)`, not `.optional()`)
- Accessed via `import { env } from '#/env'` everywhere else
- **Forbidden**: `process.env.ANYTHING` in any file except `src/env.ts` itself
- New env vars: add to `src/env.ts` server/client schema, then use `env.VAR_NAME`
- Tests use `skipValidation` when `NODE_ENV=test` (configured in env.ts), so env vars don't block test execution
- Don't make required vars optional just to avoid test failures — use `skipValidation` instead

### Linting & Formatting

Oxlint enforces code quality via pre-commit hook (husky + lint-staged). All staged `.ts`/`.tsx` files are auto-linted before commit.

- **Config**: `.oxlintrc.json` — plugins: `typescript`, `react`, `unicorn`, `import`, `jsx-a11y`
- **Run manually**: `bun run lint` (check) or `bun run lint:fix` (auto-fix)
- **Pre-commit hook**: husky runs `lint-staged` → `oxlint --fix` on staged files
- **Key enforced rules**: `no-unused-vars` (error), `no-explicit-any` (error), `react-in-jsx-scope` (off for React 19), `prefer-const` (error)
- **Do not** skip the pre-commit hook (`--no-verify`) — fix lint errors instead
- **Do not** disable rules inline unless absolutely necessary — prefer fixing the code

### Commits

After completing every subtask, make an atomic commit following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `<type>[optional scope]: <description>` (e.g. `feat(upload): add PDF text extraction service`, `fix(db): correct column type`). Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `ci`, `perf`. Keep each commit focused on one subtask.

### Knowledge Base (Evaluation Feature)

For any work touching the **Evaluation** feature (KBBI lookup, EYD checks), `.claude/KNOWLEDGE_BASE.md` is the **source of truth**. Read the relevant section there before writing rules, prompts, or schema. If a rule is ambiguous, re-read the knowledge base rather than guessing.

**What's in it** — consult `KNOWLEDGE_BASE.md` whenever you need to know:

- **KBBI integration** (§1): PostgreSQL dump shape, the 3-tier lookup strategy (dump → cache → scrape), the 4 scrape sources and their fallback order, affix-stripping rules (`AFFIX_PREFIX_RULES` / `AFFIX_SUFFIX_RULES`), proper-noun skip heuristics.
- **EYD rule catalog** (§2.0): every implemented deterministic rule ID (`eyd.double-space`, `eyd.di-locative-one-word`, `eyd.acronym-undeclared`, …) with severity, what it detects, FP guards, and section anchor. Check here before adding a new rule — you may be duplicating one that already exists, or introducing FPs the existing guards already avoid.
- **EYD canonical reference** (§2.1–§2.4): verbatim scrape of https://eyd.netlify.app/ for Penggunaan Huruf, Penulisan Kata, Tanda Baca, Unsur Serapan. When writing a new rule, anchor it to a specific section.
- **Configuration whitelists**: locative noun list (`LOCATIVE_AFTER_DI`), passive verb whitelist (`COMMON_PASSIVE_VERBS`), particle fixed forms (`PUN_FIXED_FORMS`), universal acronym whitelist (`UNIVERSAL_ACRONYMS`). Edit these in code; mirror the change in `KNOWLEDGE_BASE.md §2.0`.
- **Known coverage gaps**: en-dash vs hyphen, date format `1 Januari 2020`, currency style, reduplication, heading capitalization, APA citation style. Don't re-derive these — check the gaps list before scoping new work.

**Update protocol**: when you add, remove, or change behaviour of an EYD rule (anything matching `eyd.*` in `src/services/evaluation/eyd/`), update `KNOWLEDGE_BASE.md §2.0` in the same commit. The catalog is meant to stay in sync with code.

Reference PDFs under `.claude/pdf_examples/` (gitignored) are local-only and must never be committed. The KBBI SQL dump at `deploy/seed/kbbi-dictionary.sql` is committed so production deploys can seed the dictionary from `docker-entrypoint.sh`.

### Local Diagnostic Tooling (`.claude/scripts/`)

`.claude/scripts/` is your agent-facing toolbox of Bun TypeScript helpers for local testing, iteration, and ad-hoc diagnosis. Use these yourself before claiming a fix works — they exist so you can reproduce bugs, characterize behaviour, and validate changes against real fixtures. They are **not** production code and are not deployed.

| Script | When to run |
|--------|-------------|
| `test-autofetch.ts` | Anytime you change `src/services/pdf/finder.ts` or `src/services/pdf/auto-fetch.ts`. Exercises the full provider chain against `.claude/pdf_examples/thesis_example.pdf`, downloads each candidate URL, validates magic bytes + extraction, and reports per-ref TP/FP behaviour. Writes a full JSON report to `.claude/scripts/output/autofetch-diagnostic.json`. Honour `REF_LIMIT=N` and `CONCURRENCY=N` env vars to bound the run. |
| `classify-kbbi-iter.ts` | During the KBBI FP-reduction loop. Reads `docs/train/iterations/iter-NN/findings.json` and emits `classified.json` + `fp_summary.md` using a deterministic 8-rule TP/FP heuristic. Usage: `bun .claude/scripts/classify-kbbi-iter.ts iter-NN`. |
| `run-iteration.ts` / `run-track-iteration.ts` | Full-pipeline iteration runners for the Evaluation and Track features. Persist per-iteration output under `docs/train/iterations/iter-NN/`. |
| `diff-iterations.ts` | Diff two `iter-NN` folders to surface regressions / improvements between runs. |
| `inspect-pdf-fonts.ts` | PDF font + character introspection when extraction looks wrong (broken hyphenation, missing glyphs, etc.). |

Rules for `.claude/scripts/`:

- `console.log` is allowed here (the `no-console` rule is overridden for `.claude/scripts/**` in `.oxlintrc.json`). Diagnostic output is the whole point.
- Outputs go to `.claude/scripts/output/` (gitignored). Never commit run artefacts.
- Don't promote scripts from here into `src/` or `deploy/`. If a diagnostic needs to ship as a real feature, build a proper module under `src/services/` with tests; if it's setup that prod needs, add an idempotent `deploy/seed/*.sql` file instead.
- These scripts import from `src/` via the `#/` alias — keep them in sync with refactors. Run them after any change to the module they target.

For production seeds / DB init (app configurations, evaluation vocabulary, KBBI dictionary), see `deploy/seed/` — pure SQL, idempotent, auto-loaded by `docker-entrypoint.sh`.

### Pre-Commit Checklist

Before writing or committing any code, confirm **all** of the following. If any check fails, fix it before proceeding:

- [ ] No `any`, `unknown`, `useState`, `useEffect`, `process.env` outside `src/env.ts`
- [ ] No hardcoded colors (`#hex`, `rgb()`, `red-500`, `emerald-*`) in components — only design tokens
- [ ] Zod schemas used for all runtime validation; types derived with `z.infer<>`
- [ ] New env vars declared in `src/env.ts`, accessed via `env.VAR_NAME`
- [ ] Context7 consulted for TanStack / Tailwind v4 APIs before implementation
- [ ] Tailwind v4 patterns used (no `tailwind.config.js`, no `theme()` function, no v3 syntax)
- [ ] No absolute `px` in layout/sizing arbitrary values — use `rem`, `vh`, `vw`, or `%`. Reserve `px` for borders, focus rings, 1–2px nudges, and shadow offsets.
- [ ] Commit follows Conventional Commits format

## Project Overview

CiteTrack is a full-stack web app built with TanStack Start (React 19), Drizzle ORM (PostgreSQL), Better Auth, and Tailwind CSS 4. Scaffolded via `create-tanstack-app` with add-ons: drizzle, form, shadcn, better-auth, tanstack-query.

## Commands

```bash
bun run dev             # Dev server on port 3000
bun run build           # Production build
bun run preview         # Preview production build
bun test                # Run Vitest tests
bun run test -- --watch # Watch mode

# Database (Drizzle Kit)
bun run db:generate     # Generate migration files
bun run db:migrate      # Run migrations
bun run db:push         # Push schema directly (no migration files)
bun run db:pull         # Pull schema from database
bun run db:studio       # Open Drizzle Studio GUI

# Linting
bun run lint            # Run oxlint
bun run lint:fix        # Run oxlint with auto-fix

# Shadcn UI components
pnpm dlx shadcn@latest add <component>
```

## Architecture

### Stack

- **Framework**: TanStack Start (SSR + server functions via `createServerFn`)
- **Routing**: TanStack Router — file-based, routes live in `src/routes/`
- **Data Fetching**: TanStack Query — provider set up in `src/integrations/tanstack-query/root-provider.tsx`
- **Forms**: TanStack Form — custom hook contexts in `src/hooks/`
- **Database**: Drizzle ORM + PostgreSQL (`pg`) — connection in `src/db/index.ts`, schema in `src/db/schema.ts`
- **UI**: Shadcn (new-york style) + Radix UI + CVA + Tailwind CSS 4 + Lucide icons
- **Validation**: Zod v4

### Path Aliases

Both `#/*` and `@/*` resolve to `./src/*`. Prefer `#/*` (configured in package.json `imports` field).

### Key Directories

- `src/routes/` — File-based routes; `__root.tsx` is the shell layout (Header, Footer, theme init, providers)
- `src/components/ui/` — Shadcn UI primitives (button, input, select, slider, switch, label, textarea)
- `src/components/` — App-level components (Header, Footer, ThemeToggle)
- `src/lib/` — Auth config, `cn()` utility
- `src/db/` — Drizzle connection and schema
- `src/hooks/` — TanStack Form hook contexts
- `src/integrations/` — TanStack Query provider, Better Auth header component
- `src/styles.css` — Tailwind imports + custom CSS variables (theme colors, glass effects, animations)

### Theme System

CSS custom properties in `src/styles.css` with light/dark modes. Theme preference stored in localStorage and initialized before hydration (script in `__root.tsx`). Three modes: light, dark, auto (system).

Key design tokens: `--sea-ink`, `--lagoon`, `--palm`, `--sand`, `--foam`.

### Database Schema

Defines `jobs` and `pages` tables in `src/db/schema.ts`. Drizzle config reads `DATABASE_URL` from `.env.local`.

### Environment Variables

Defined in `.env.local` (gitignored):
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth secret (generate with `bunx --bun @better-auth/cli secret`)

## Design Context

> The full version of this section lives in `.impeccable.md` at the project root. The summary below is loaded into every session so design decisions stay aligned. When the two diverge, `.impeccable.md` wins — update both together.

### Users

Indonesian undergraduate students writing their **skripsi** (thesis) across every discipline (engineering, biomedicine, law, humanities, education), plus the lecturers / advisors who review those drafts. They open CiteTrack at a desk under a submission-deadline crunch. Many are not fluent in English — UI labels can be English, but user-facing prose, prompts, and explanations should sound like a thoughtful Indonesian editor, not a Silicon Valley product.

### Brand Personality

**Trustworthy. Calm. Friendly.** — in that order.

- **Trustworthy** — students will defend the report to their advisor; no confidence theatre, no AI-handwaviness. When uncertain, say so plainly.
- **Calm** — thesis-writing is already stressful. Generous whitespace, no urgency theatre, no streaks/badges/celebrations.
- **Friendly** — Indonesian-warm. Address the user with respect ("Tahukah kamu?", not "Pro tip!"). Conversational, never playful.

The interface should feel like a thoughtful friend pulling out an annotated draft and pointing at the bits worth looking at.

### Aesthetic Direction — Soft pastel + doodles

Adopt fully. Pages are stacks of colored bands; headlines carry one accent-word treatment; doodles accent the margins.

- **Stack `<Section tone="butter|mint|blush|sky|cream">` blocks vertically** — never multiple bands of the same tone touching. Body widths sit inside the section's centered content column.
- **Display type is Manrope ExtraBold** (mixed case, tracking `-0.022em`). Body is Inter. No serif display.
- **Accent words inside headlines.** One per headline. Either `<AccentInk>kata</AccentInk>` (coral/indigo color) or `<Marker tone="green|yellow|blush|sky">kata</Marker>` (soft pill + hand-drawn underline).
- **Doodles in `src/components/doodles/`** — Squiggle, DottedArc, Underline, Sparkles, Lightbulb, Arrow, StarBurst, PaperPlane. Stroke-only, accent only, **one or two per band max**.
- **Buttons are pills.** Use the `Button` primitive with `variant`: `default` (coral), `secondary` (indigo), `outline` (cream + line), `ghost`. No hand-rolled filled buttons.
- **Cards are 1rem rounded soft surfaces.** Use the `.soft-card` class plus a `data-tone` attribute (`cream | butter | mint | blush | sky`), or wrap shadcn Card.
- **Severity is pastel-coded.** `--bg-blush` for errors, `--bg-butter` for warnings, `--bg-sky` for info. Use `.severity-badge` + `data-severity` for the inline marker.
- **Light-only theme.** No dark mode.

#### Explicitly NOT

- **Mascot illustrations.** Doodles are in; cartoon characters with backpacks are out.
- **AI / dashboard tropes**: purple→blue gradients, glowing dark UI, identical-icon-card grids, hero sparklines.
- **Performative encouragement**: streaks, badges, points, confetti, "Great job!" toasts. Visual playfulness is permitted; written cheerleading is not.
- **Saturated section backgrounds.** Coral and indigo are CTA-only. Section backgrounds stay in the soft pastel range.

### Design Principles

1. **Bands of color compose the page.** Stack `<Section>` blocks; alternate tones; no full-bleed coral or indigo.
2. **One accent per headline.** Either `<AccentInk>` or `<Marker>` on one word — never both, never on multiple words.
3. **Doodles are seasoning.** If a page reads as "decorated", remove one.
4. **The document is still the subject.** On Evaluation report, Track review phases, and Results, the PDF preview and findings table are the largest and most legible elements. Doodles do not appear inside the data area.
5. **Calm voice in warm seams.** Visual personality is loud; written voice stays quiet. "kamu" not "anda", "Tahukah kamu?" not "Pro tip!", no exclamations or emoji.
