# CiteTrack — Feature Specification

> Upload your thesis → get a complete map showing exactly which page and passage from each source paper you cited, even when your thesis is in Bahasa Indonesia and the source is in English.

---

## Stack (Actual)

| Layer | Tech |
|-------|------|
| Framework | TanStack Start (SSR + server functions) |
| Frontend | React 19 + TanStack Router/Query/Form |
| UI | Shadcn/ui + Tailwind CSS 4 + Radix UI |
| Auth | Better Auth (email/password) |
| Database | PostgreSQL + Drizzle ORM |
| PDF Parsing | pdfjs-dist (server-side) |
| AI Matching | Anthropic Claude API (cross-language semantic) |
| PDF Discovery | DOI resolver → Semantic Scholar → SerpAPI → Unpaywall |
| Runtime | Bun |

---

## Feature Map

### F1 — PDF Upload & Text Extraction ✅

**What:** User uploads a thesis PDF. System extracts full text page-by-page.

- Drag-and-drop upload zone with file validation (PDF only, max 50MB)
- Server-side text extraction via pdfjs-dist
- Store extracted text per page in DB for reprocessing
- Handle scanned PDFs gracefully — detect low text density and warn user ("This PDF appears to be scanned. Text extraction may be incomplete.")
- Show upload progress and extraction status

**Output:** `{ pages: [{ pageNumber, text }] }` stored against the job.

---

### F2 — Citation Parsing ✅

**What:** Detect all in-text citations from the extracted thesis text.

- **Regex-first approach** for common patterns:
  - Parenthetical: `(Author, Year)`, `(Author & Author, Year)`, `(Author et al., Year)`
  - Narrative: `Author (Year)`, `Menurut Author (Year)`
  - Bahasa-specific: `(dalam Author, Year)`, `(dikutip dari Author, Year)`
  - Multi-citation: `(Author, Year; Author, Year)`
  - Page-specific: `(Author, Year, p. 42)`, `(Author, Year, hlm. 42)`
- **Claude API fallback** when regex confidence is low (ambiguous patterns, unusual formatting)
- Group by unique citation key (Author + Year)
- Record thesis page number and surrounding context (±1 sentence) for each occurrence
- Show parsed citations to user for review before proceeding

**Output:** List of `{ citationKey, thesisPage, thesisContext, occurrenceCount }`

---

### F3 — Reference List Extraction (Daftar Pustaka) ✅

**What:** Parse the reference/bibliography section into structured entries.

- Auto-detect reference section by heading heuristic: "Daftar Pustaka", "References", "Bibliography", "Referensi"
- Parse each entry into: `{ author, year, title, doi?, url?, publisher?, journal? }`
- Handle multiple citation styles: APA, IEEE, Harvard, Chicago
- Claude API assist for messy/non-standard formatting
- Show parsed references to user for validation and manual correction

**Output:** List of `{ referenceId, author, year, title, doi, url, rawText }`

---

### F4 — Citation ↔ Reference Matching ✅

**What:** Link each in-text citation to its full reference entry.

- Fuzzy matching on author surname + year
- Handle "et al." → match to multi-author reference
- Handle inconsistencies (e.g., "Tannenbaum" vs "Tanenbaum" typos)
- Flag unmatched citations (citation exists but no matching reference → "orphan citation")
- Flag unreferenced entries (reference exists but never cited → "unused reference")
- User can manually fix mismatches via UI

**Output:** Linked pairs `{ citationKey → referenceEntry }` with match confidence

---

### F5 — Source PDF Discovery & Fetching

**What:** Automatically find and download the source PDFs for each reference.

- **Waterfall strategy** (try in order, stop on first success):
  1. DOI resolver (doi.org → follow redirect → PDF link)
  2. Unpaywall API (free, legal open-access via DOI)
  3. Semantic Scholar API (free, no key, covers CS/engineering well)
  4. SerpAPI Google Scholar (broadest coverage, 100 free/month)
  5. Mark as "not found"
- Download PDF to server temp storage
- Extract text per page from source PDF (same as F1)
- **Manual upload fallback** — when auto-fetch fails, let user upload the source PDF themselves
- Show fetch progress per reference (found/downloading/extracting/failed)
- Cache fetched PDFs to avoid re-downloading across jobs

**Output:** `{ referenceId, sourcePdfUrl, fetchSource, pages: [{ pageNumber, text }] }`

---

### F6 — Cross-Language Semantic Matching (Core Feature)

**What:** For each citation, find the exact page and passage in the source PDF that supports the claim made in the thesis.

- **Pre-filter** candidate pages using keyword overlap (author names, numbers, proper nouns transfer across languages)
- **Claude API matching** — send thesis context + top ~10 candidate pages:
  ```
  THESIS CONTEXT (Bahasa Indonesia): "..."
  SOURCE PDF PAGES: [page texts]
  → Return: { page, passage, confidence, reasoning }
  ```
- **Batch processing** — chunk long source PDFs, process citations in parallel where possible
- **Confidence scoring** (0.0–1.0):
  - ≥ 0.8 = High confidence (green) — auto-verified
  - 0.5–0.79 = Medium confidence (yellow) — needs review
  - < 0.5 = Low confidence (red) — likely mismatch or passage not found
- Handle cases where citation spans multiple pages
- Handle paraphrasing (thesis restates in different words) vs direct quotes

**Output:** `{ citationId, sourcePage, matchedPassage, confidence, reasoning }`

---

### F7 — Results Dashboard

**What:** Interactive, scannable overview of all citation traces.

- **Summary stats**: total citations, matched, unmatched, avg confidence
- **Citation table** with columns:
  - Citation key (Author, Year)
  - Thesis page
  - Thesis context (expandable)
  - Source title
  - Source page
  - Matched passage (expandable)
  - Confidence badge (color-coded)
  - Status (verified / needs review / not found)
- **Filters**: by confidence level, by status, by reference
- **Sort**: by thesis page order, by confidence, by status
- **Search**: filter citations by keyword
- **Bulk actions**: mark all high-confidence as verified, re-run matching for selected

---

### F8 — Export

**What:** Download the citation map in usable formats.

- **CSV** — flat table for spreadsheet analysis
- **JSON** — structured data for programmatic use
- **PDF Report** — formatted document with:
  - Summary statistics
  - Citation map table
  - Flagged issues (orphan citations, unused references, low-confidence matches)
  - Suitable for attaching to thesis submission as verification proof

---

### F9 — Real-Time Progress Tracking

**What:** The pipeline is long-running (minutes for a full thesis). Show progress live.

- SSE (Server-Sent Events) from server to client
- Progress bar with step labels:
  - Step 1/9: Extracting thesis text...
  - Step 3/9: Parsing citations (found 47)...
  - Step 6/9: Fetching source PDF 12/30...
  - Step 8/9: Matching citation 23/47...
- Per-citation status updates in the results table (rows fill in as they complete)
- Estimated time remaining based on per-citation processing speed
- Cancel button to abort processing

---

### F10 — Job History & Persistence

**What:** Users can view past jobs and re-run analysis.

- Job list showing: filename, date, citation count, match rate, status
- Re-open any past job to view full results
- Re-run matching for specific citations (e.g., after uploading a manual PDF)
- Delete old jobs and associated data

---

### F11 — Authentication

**What:** User accounts to persist jobs and manage quotas.

- Email/password registration and login (Better Auth, already scaffolded)
- Jobs are scoped to authenticated users
- Guest mode: allow one free analysis without signup, prompt to register to save results

---

### F12 — Manual Correction & Review UI

**What:** Let users fix mistakes in the automated pipeline.

- **Edit parsed citations** — fix author name, year if parser got it wrong
- **Edit parsed references** — correct title, DOI, author for better PDF discovery
- **Re-link citation ↔ reference** — drag or select to fix mismatches
- **Upload source PDF manually** — for references where auto-fetch failed
- **Override match result** — user can mark a match as correct/incorrect, add notes
- **Re-run single citation** — after manual corrections, re-process just that one

---

## Priority Tiers

### MVP (v0.1) — Core Pipeline
> Goal: End-to-end flow works for one thesis.

- [x] F1: PDF Upload & Text Extraction
- [x] F2: Citation Parsing (regex + Claude fallback)
- [x] F3: Reference List Extraction
- [x] F4: Citation ↔ Reference Matching
- [ ] F5: Source PDF Discovery (waterfall, no manual upload yet)
- [ ] F6: Cross-Language Semantic Matching
- [ ] F7: Results Dashboard (basic table)
- [ ] F8: Export (CSV + JSON only)
- [ ] F9: Real-Time Progress (SSE)
- [ ] F11: Authentication (login/register)

### v0.2 — Polish & Usability
> Goal: Handle edge cases, let users fix mistakes.

- F10: Job History & Persistence
- F12: Manual Correction & Review UI
- F5+: Manual PDF upload fallback
- F7+: Filters, sort, search in results table
- F8+: PDF Report export

### v0.3 — Advanced
> Goal: Handle more citation styles and scale.

- F2+: Numbered citation styles `[1]`, `[1,2,3]`
- F6+: PDF viewer with highlighted matched passages (react-pdf)
- F5+: PDF caching across jobs
- Batch processing optimization (parallel PDF fetches + Claude calls)
- Rate limiting and retry logic for external APIs

---

## Non-Functional Requirements

- **Performance**: Full thesis (30 citations) should complete in < 10 minutes
- **Cost**: Claude API usage should be optimized — pre-filter pages before sending to API, batch where possible
- **Privacy**: Uploaded PDFs stored temporarily, auto-cleaned after 7 days. Users can delete anytime.
- **Error handling**: Never leave user stuck. Every failure has a fallback (auto-fetch fails → manual upload, regex fails → Claude fallback, Claude fails → mark as "needs manual review")
- **Responsive**: Works on desktop (primary) and tablet. Mobile is not a priority.
