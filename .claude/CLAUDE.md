# CLAUDE.md

**MANDATORY** — Every rule below is a hard constraint, not a suggestion. Violating any rule is a build-breaking error. Before writing or modifying any code, re-read the relevant rules. If a rule says "forbidden", treat it as if the linter will reject it. No exceptions unless the rule explicitly defines one.

## Rules (STRICTLY ENFORCED)

### Code Style

- Don't add unnecessary comments
- Use Bun to manage packages and dev tooling

### Type Safety

No `any` or `unknown` — always use precise types. Only use `any`/`unknown` when strictly unavoidable (e.g. third-party lib gaps, type assertion boundaries) and add a `// eslint-disable-next-line` comment explaining why.

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

- **Semantic colors** (shadcn): `bg-primary`, `text-destructive`, `bg-secondary`, `text-muted-foreground`, `bg-accent`, `border-border`
- **Brand tokens**: `var(--sea-ink)`, `var(--lagoon)`, `var(--palm)`, `var(--sand)`, `var(--foam)`, `var(--surface)`
- **Status colors**: use `--destructive` for errors (not `red-500`), `--accent`/`--palm` for success (not `emerald-500`), `--secondary`/`var(--kicker)` for warnings (not `amber-500`)
- **Forbidden**: raw `#hex`, `rgb()`, `rgba()` values in component files; Tailwind color names like `emerald-*`, `amber-*`, `red-*`, `green-*` — use the semantic tokens instead
- **Exception**: `src/styles.css` itself and decorative gradients/shadows in layout shells are allowed to use raw values

### Tailwind CSS v4

This project uses Tailwind v4, which differs significantly from v3:

- Use native CSS for theming: CSS custom properties in `@theme inline {}`, not `tailwind.config.js`
- Colors can be any CSS format (hex, rgb, hsl, oklch) — no need to convert between formats
- Use `@custom-variant` for custom variants (e.g. `@custom-variant dark (&:is(.dark *))`)
- Use `@plugin` instead of `plugins: []` in config
- Use `@theme inline {}` to map CSS variables to Tailwind utility classes
- Always check context7 for Tailwind v4 docs before writing Tailwind config — v3 patterns will not work

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

### Code Graph

Use the code-review-graph MCP to explore the codebase:

- Run `/code-review-graph:build-graph` at the start of a session if the graph hasn't been built yet
- Use `query_graph_tool` to explore dependencies, imports, and call relationships between modules
- Use `semantic_search_nodes_tool` to find relevant code by concept (e.g. "authentication", "database query")
- Use `get_impact_radius_tool` before making changes to understand what will be affected
- Use `get_review_context_tool` when reviewing code to get full structural context
- Use `find_large_functions_tool` to identify refactoring candidates
- Use `list_graph_stats_tool` to get a high-level overview of the codebase structure
- Prefer graph queries over manual file-by-file exploration for understanding code relationships

### Knowledge Base (Evaluation Feature)

For any work touching the **Evaluation** feature (EYD checks, KBBI lookup, FILKOM Skripsi template validation), `.claude/KNOWLEDGE_BASE.md` is the **source of truth**. Read the relevant section there before writing rules, prompts, or schema. If a rule is ambiguous, re-read the knowledge base rather than guessing — it consolidates the FILKOM Skripsi Template v3.0, the KBBI dump / scraper integration, and the full EYD rule set scraped from https://eyd.netlify.app/.

Reference PDFs under `.claude/pdf_examples/` (gitignored) and the KBBI SQL dump under `data/sql/` (gitignored) are local-only and must never be committed.

### Pre-Commit Checklist

Before writing or committing any code, confirm **all** of the following. If any check fails, fix it before proceeding:

- [ ] No `any`, `unknown`, `useState`, `useEffect`, `process.env` outside `src/env.ts`
- [ ] No hardcoded colors (`#hex`, `rgb()`, `red-500`, `emerald-*`) in components — only design tokens
- [ ] Zod schemas used for all runtime validation; types derived with `z.infer<>`
- [ ] New env vars declared in `src/env.ts`, accessed via `env.VAR_NAME`
- [ ] Context7 consulted for TanStack / Tailwind v4 APIs before implementation
- [ ] Tailwind v4 patterns used (no `tailwind.config.js`, no `theme()` function, no v3 syntax)
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
- **Auth**: Better Auth (email/password) — server config in `src/lib/auth.ts`, client in `src/lib/auth-client.ts`, API route at `src/routes/api/auth/$.ts`
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
