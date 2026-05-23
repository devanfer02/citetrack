# CiteTrack

**Upload your thesis PDF → get a complete map of where every citation lives in the source literature.**

CiteTrack automates citation-to-source verification for academic theses. It parses your in-text citations, extracts your reference list, fetches the source papers, and traces each claim back to the exact page and passage — even across languages.

## Pipeline

```
Thesis PDF  →  Extract Text  →  Parse Citations  →  Extract References
                                                           ↓
Citation Map  ←  Passage Match (Claude)  ←  Fetch Source PDFs
```

1. **Extract** — Pull text from your thesis PDF page-by-page
2. **Parse** — Detect `(Author, Year)` citations including Bahasa patterns like `(dalam Author, Year)`
3. **Match** — Fuzzy-match each citation to its bibliography entry, flag orphans
4. **Fetch** — Find source PDFs via DOI → Unpaywall → Semantic Scholar
5. **Trace** — Cross-language passage matching via Claude API *(planned)*

## Quick Start

```bash
bun install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET
bun run db:migrate
bun run dev                   # → localhost:3000
```

Requires [Bun](https://bun.sh/) 1.1+ and PostgreSQL 15+.

## Stack

TanStack Start (React 19) · Drizzle ORM · PostgreSQL · Better Auth · Tailwind CSS v4 · Shadcn/ui · Zod v4 · pdfjs-dist · Claude API

## Roadmap

- [x] PDF upload & text extraction
- [x] Citation parsing (parenthetical, narrative, Bahasa-specific)
- [x] Reference list extraction
- [x] Citation ↔ reference matching
- [x] Source PDF discovery & fetching
- [ ] Cross-language semantic matching (Claude API)
- [ ] Results dashboard
- [ ] Export (CSV/JSON/PDF)
- [ ] Job history & manual corrections

## License

MIT
