# tests/unit

Pure-function tests. **Must run in well under 10s.**

Hard rules (enforced by convention, not lint):

- No PDF read, no DB, no testcontainers.
- No `refreshVocabularyCache()`, no scrape, no warm-up that talks to the network.
- No `*.integration.test.ts` suffix — the directory says it.
- Mirror `src/` layout below this folder.
- If a test needs any of the forbidden things, it lives in `tests/integration/` instead.
