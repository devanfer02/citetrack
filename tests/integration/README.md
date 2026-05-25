# tests/integration

Tests that touch real PDFs (`.claude/pdf_examples/*.pdf`), the database (via testcontainers or `.env.local` DATABASE_URL), or expensive caches (`refreshVocabularyCache`).

Rules:

- Every `it(...)` declares an explicit timeout. PDF-only tests: 60_000–120_000ms. KBBI/analyzer tests: 600_000ms.
- Warm shared caches in `beforeAll`, never `beforeEach`.
- Resolve fixture paths from `process.cwd()`, not `__dirname`.
- DB-touching tests use a real Postgres (testcontainer) — never mock Drizzle.
- Mirror `src/` layout below this folder.
