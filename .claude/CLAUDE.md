# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- Don't add unnecessary comments
- Use Serena MCP for semantic code search and replace
- Use Bun to manage packages and dev tooling

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

Currently defines a `todos` table in `src/db/schema.ts`. Drizzle config reads `DATABASE_URL` from `.env.local`.

### Environment Variables

Defined in `.env.local` (gitignored):
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth secret (generate with `bunx --bun @better-auth/cli secret`)
