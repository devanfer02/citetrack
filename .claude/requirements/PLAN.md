# Citation Tracer

**A web tool that scans your thesis, traces each citation back to its source PDF, and pinpoints the exact page and passage used — even across languages.**

---

## Problem

When writing a thesis in Bahasa Indonesia that cites English and Indonesian papers, it's hard to verify which exact page/passage each citation refers to. Manual cross-referencing is tedious and error-prone.

## Solution

Upload your thesis PDF → the app parses every in-text citation → matches it to your daftar pustaka → finds/fetches the source PDF → uses Claude API to identify the exact page and passage (cross-language) → outputs a clean reference map.

---

## Tech Stack

| Layer        | Tech                          |
|------------- |-------------------------------|
| Frontend     | React + Vite + TypeScript     |
| Backend      | Hono + Node.js + TypeScript   |
| PDF Parsing  | pdfjs-dist (server-side)      |
| Matching     | Claude API (cross-lang semantic) |
| PDF Search   | SerpAPI or Scholarly API      |
| Database     | SQLite (via Drizzle ORM)      |
| Monorepo     | pnpm workspaces               |

---

## Core Pipeline

```
[1] Upload Thesis PDF
        │
        ▼
[2] Extract Full Text (per page)
    ── pdfjs-dist server-side
        │
        ▼
[3] Parse In-Text Citations
    ── Regex for (Author, Year) patterns
    ── Group by unique citation key
        │
        ▼
[4] Extract Daftar Pustaka
    ── Detect reference section (heuristic: "Daftar Pustaka" / "References" heading)
    ── Parse each entry → { author, year, title, doi?, url? }
        │
        ▼
[5] Match Citation → Reference
    ── Match (Author, Year) from step 3 to parsed entries from step 4
    ── Output: { citationKey, fullReference, sourceTitle, doi/url }
        │
        ▼
[6] Find & Fetch Source PDFs
    ── If DOI exists → resolve via doi.org
    ── Else → search SerpAPI (Google Scholar) by title
    ── Download PDF to temp storage
        │
        ▼
[7] Extract Source PDF Text (per page)
    ── pdfjs-dist again
    ── Store as { pageNumber, text }[]
        │
        ▼
[8] Cross-Language Semantic Matching
    ── For each citation occurrence:
       • Get surrounding context from thesis (±1 sentence)
       • Send to Claude API along with candidate pages from source PDF
       • Prompt: "Which page contains the source for this claim?
                  Return: page number, relevant passage, confidence score"
    ── Handle batching (chunk pages if source PDF is long)
        │
        ▼
[9] Output Results
    ── Citation map: { citation, thesisPage, sourceTitle, sourcePage, matchedPassage, confidence }
    ── Render as interactive table in frontend
    ── Export as CSV / JSON
```

---

## Project Structure

```
citation-tracer/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
│
├── packages/
│   ├── web/                  # Frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── UploadThesis.tsx
│   │   │   │   ├── CitationTable.tsx
│   │   │   │   ├── ProgressTracker.tsx
│   │   │   │   └── ExportButton.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useCitationTracer.ts
│   │   │   ├── lib/
│   │   │   │   └── api.ts
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── api/                  # Backend (Hono)
│       ├── src/
│       │   ├── index.ts             # Hono app entry
│       │   ├── routes/
│       │   │   ├── upload.ts        # POST /upload — receive thesis PDF
│       │   │   ├── process.ts       # POST /process — trigger full pipeline
│       │   │   ├── status.ts        # GET /status/:jobId — SSE progress
│       │   │   └── results.ts       # GET /results/:jobId — final output
│       │   ├── services/
│       │   │   ├── pdf-extractor.ts     # pdfjs-dist wrapper
│       │   │   ├── citation-parser.ts   # Regex + heuristic parsing
│       │   │   ├── reference-parser.ts  # Daftar pustaka parsing
│       │   │   ├── pdf-finder.ts        # SerpAPI / DOI resolver
│       │   │   ├── matcher.ts           # Claude API semantic matching
│       │   │   └── pipeline.ts          # Orchestrates steps 1-9
│       │   ├── db/
│       │   │   ├── schema.ts        # Drizzle schema
│       │   │   └── index.ts         # DB connection
│       │   └── lib/
│       │       ├── claude.ts        # Anthropic SDK wrapper
│       │       └── config.ts        # Env vars
│       └── package.json
│
└── packages/shared/          # Shared types
    ├── types.ts
    └── package.json
```

---

## API Routes

### `POST /upload`
Upload thesis PDF. Returns `jobId`.

### `POST /process/:jobId`
Trigger the full pipeline. Processing happens async.

### `GET /status/:jobId`
SSE endpoint streaming progress updates:
```jsonc
{ "step": 3, "label": "Parsing citations...", "progress": 35 }
{ "step": 6, "label": "Fetching source PDF 3/12...", "progress": 58 }
```

### `GET /results/:jobId`
Returns final citation map:
```jsonc
{
  "citations": [
    {
      "citationKey": "Tanenbaum, 2021",
      "thesisPage": 14,
      "thesisContext": "Menurut Tanenbaum (2021), model TCP/IP terdiri dari...",
      "source": {
        "title": "Computer Networks, 6th Edition",
        "page": 42,
        "matchedPassage": "The TCP/IP model consists of four layers...",
        "confidence": 0.92
      }
    }
  ]
}
```

---

## Database Schema (SQLite + Drizzle)

```
jobs
  id          TEXT PRIMARY KEY
  status      TEXT  -- pending | processing | done | failed
  filename    TEXT
  created_at  INTEGER
  updated_at  INTEGER

citations
  id            TEXT PRIMARY KEY
  job_id        TEXT REFERENCES jobs(id)
  citation_key  TEXT  -- "Tanenbaum, 2021"
  thesis_page   INTEGER
  thesis_context TEXT
  reference_title TEXT
  reference_doi   TEXT
  reference_url   TEXT

matches
  id              TEXT PRIMARY KEY
  citation_id     TEXT REFERENCES citations(id)
  source_page     INTEGER
  matched_passage TEXT
  confidence      REAL
  source_pdf_url  TEXT
```

---

## Claude API Prompt Strategy

### Citation Parsing (Step 3-4 fallback)
If regex fails on complex citations, use Claude as fallback:
```
Given this thesis page text, extract all in-text citations.
Return JSON: [{ "author": "...", "year": "...", "context": "surrounding sentence" }]
```

### Cross-Language Matching (Step 8)
```
You are a citation verification assistant.

THESIS CONTEXT (Bahasa Indonesia):
"{thesis_context}"

CITATION: {author}, {year}

SOURCE PDF PAGES:
Page 41: "{page_41_text}"
Page 42: "{page_42_text}"
Page 43: "{page_43_text}"
...

Which page(s) contain the information that the thesis is citing?
Return JSON:
{
  "page": number,
  "passage": "exact relevant passage from source",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}
```

Send pages in chunks of ~5-10 to stay within context limits. If source PDF is long, do a rough keyword pre-filter first to narrow candidate pages.

---

## Key Decisions & Notes

1. **Full CSR** — no SSR needed. The backend is a pure API; frontend is a static SPA.

2. **SSE for progress** — the pipeline takes time (fetching PDFs, calling Claude per citation). SSE gives real-time feedback without WebSocket complexity.

3. **SQLite over Postgres** — it's a side project / single-user tool. SQLite is zero-config and Drizzle supports it well.

4. **SerpAPI over scraping** — Google Scholar scraping is fragile and gets rate-limited fast. SerpAPI has a free tier (100 searches/month) which is enough for one thesis. Alternative: Semantic Scholar API (free, no key needed) for academic papers.

5. **Page chunking for Claude** — a 300-page textbook can't fit in one prompt. Pre-filter candidate pages using keyword overlap (even cross-language, author names / numbers / proper nouns overlap), then send top ~10 candidates to Claude for semantic matching.

6. **Confidence threshold** — display matches with confidence < 0.7 as "uncertain" in the UI so the user can manually verify.

---

## MVP Scope (v0.1)

- [ ] Upload thesis PDF + extract text
- [ ] Parse in-text citations via regex `(Author, Year)`
- [ ] Parse daftar pustaka section
- [ ] Match citations to references
- [ ] Auto-fetch source PDFs (waterfall strategy — see below)
- [ ] Claude API cross-language matching
- [ ] Results table with export

### Auto-Fetch Strategy (Waterfall)

For each reference, try sources in order until a PDF is found:

```
1. DOI resolver (doi.org → follow redirect → check for PDF link)
       │ fail
       ▼
2. Semantic Scholar API (free, no key, returns PDF URLs when available)
       │ fail
       ▼
3. SerpAPI Google Scholar (100 free/month, best coverage)
       │ fail
       ▼
4. Unpaywall API (free, legal open-access PDFs via DOI)
       │ fail
       ▼
5. Mark as "not found" → let user upload manually as fallback
```

**Why this order:**
- DOI is the fastest and most reliable if the reference has one
- Semantic Scholar is free with no key and covers most CS/engineering papers
- SerpAPI has the broadest coverage but limited free tier — save it for misses
- Unpaywall specifically finds legal open-access versions
- Manual fallback ensures nothing is completely blocked

### `pdf-finder.ts` Service Shape

```typescript
interface PdfFindResult {
  url: string;
  source: 'doi' | 'semantic-scholar' | 'serpapi' | 'unpaywall' | 'manual';
  confidence: number;
}

async function findPdf(ref: ParsedReference): Promise<PdfFindResult | null> {
  if (ref.doi) {
    const result = await tryDoi(ref.doi);
    if (result) return result;

    const unpaywall = await tryUnpaywall(ref.doi);
    if (unpaywall) return unpaywall;
  }

  const semantic = await trySemanticScholar(ref.title, ref.author);
  if (semantic) return semantic;

  const scholar = await trySerpApi(ref.title);
  if (scholar) return scholar;

  return null; // triggers manual upload prompt in UI
}
```

## v0.2 (Post-MVP)

- [ ] Batch processing optimization (parallel PDF fetches)
- [ ] Citation style support beyond `(Author, Year)` — e.g., numbered `[1]`
- [ ] Highlight matched passages in a PDF viewer (react-pdf)
- [ ] Cache fetched PDFs to avoid re-downloading
- [ ] Rate limiting / retry logic for external APIs