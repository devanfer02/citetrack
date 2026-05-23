# Extended PDF Source Waterfall Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CrossRef, OpenAlex, and CORE as PDF source providers in a two-tier waterfall (DOI-based then title-based).

**Architecture:** Extend the existing `findPdf()` waterfall with three new sources. Each source is an isolated async function returning `PdfFindResult | null`. The waterfall splits into Tier 1 (DOI-based: DOI → Unpaywall → CrossRef → OpenAlex) and Tier 2 (title-based: Semantic Scholar → OpenAlex → CORE). OpenAlex appears in both tiers.

**Tech Stack:** Zod (response validation), fetch API, t3-env (CORE_API_KEY), Drizzle (enum migration)

---

### Task 1: Add new source values to schemas and enums

**Files:**
- Modify: `src/schemas/pdf-finder.ts`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Update Zod fetch source enum**

In `src/schemas/pdf-finder.ts`, add `'crossref'`, `'openalex'`, `'core'` to `fetchSourceSchema`:

```typescript
export const fetchSourceSchema = z.enum([
  'doi',
  'unpaywall',
  'semantic-scholar',
  'crossref',
  'openalex',
  'core',
  'manual',
])
```

- [ ] **Step 2: Update Drizzle DB enum**

In `src/db/schema.ts`, update `fetchSourceEnum`:

```typescript
export const fetchSourceEnum = pgEnum('fetch_source', [
  'doi',
  'unpaywall',
  'semantic-scholar',
  'crossref',
  'openalex',
  'core',
  'manual',
])
```

- [ ] **Step 3: Push schema change**

Run: `bun run db:push`

- [ ] **Step 4: Commit**

```
feat(schema): add crossref, openalex, core to fetch source enum
```

---

### Task 2: Add CORE_API_KEY to env config

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add optional CORE_API_KEY**

In `src/env.ts`, add to server schema:

```typescript
CORE_API_KEY: z.string().min(1).optional(),
```

- [ ] **Step 2: Update .env.example**

Add:

```
# Optional — CORE API key for open access paper search (https://core.ac.uk/services/api)
CORE_API_KEY=
```

- [ ] **Step 3: Commit**

```
chore(env): add optional CORE_API_KEY
```

---

### Task 3: Add Zod response schemas for new sources

**Files:**
- Modify: `src/schemas/pdf-finder.ts`

- [ ] **Step 1: Add CrossRef response schema**

```typescript
export const crossRefResponseSchema = z.object({
  message: z.object({
    link: z
      .array(
        z.object({
          URL: z.string().url(),
          'content-type': z.string().optional(),
        }),
      )
      .optional()
      .default([]),
    resource: z
      .object({
        primary: z.object({ URL: z.string().url() }).optional(),
      })
      .optional(),
  }),
})
```

- [ ] **Step 2: Add OpenAlex response schemas**

```typescript
export const openAlexWorkSchema = z.object({
  open_access: z
    .object({
      is_oa: z.boolean().optional(),
      oa_url: z.string().url().nullable().optional(),
    })
    .optional(),
  primary_location: z
    .object({
      pdf_url: z.string().url().nullable().optional(),
      landing_page_url: z.string().url().nullable().optional(),
    })
    .nullable()
    .optional(),
})

export const openAlexSearchSchema = z.object({
  results: z.array(openAlexWorkSchema).optional().default([]),
})
```

- [ ] **Step 3: Add CORE response schema**

```typescript
export const coreSearchSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        downloadUrl: z.string().url().nullable().optional(),
        sourceFulltextUrls: z.array(z.string().url()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
})
```

- [ ] **Step 4: Commit**

```
feat(schema): add CrossRef, OpenAlex, CORE response schemas
```

---

### Task 4: Implement tryCrossRef

**Files:**
- Modify: `src/services/pdf/finder.ts`
- Test: `tests/services/pdf/pdf-finder.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('CrossRef', () => {
  it('returns PDF URL from CrossRef link array', async () => {
    // DOI fails
    mockFetch.mockResolvedValueOnce({ ok: false, headers: new Headers() })
    // Unpaywall fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ best_oa_location: null }),
    })
    // CrossRef succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          link: [
            { URL: 'https://publisher.com/paper.pdf', 'content-type': 'application/pdf' },
          ],
        },
      }),
    })

    const result = await findPdf({
      doi: '10.1234/test',
      title: 'Test Paper',
      author: 'Smith',
    })

    expect(result).toEqual({
      url: 'https://publisher.com/paper.pdf',
      source: 'crossref',
    })
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `bun test tests/services/pdf/pdf-finder.test.ts`

- [ ] **Step 3: Implement tryCrossRef**

```typescript
async function tryCrossRef(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = crossRefResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null

    const pdfLink = parsed.data.message.link.find((l) =>
      l['content-type']?.includes('application/pdf'),
    )
    if (pdfLink) return { url: pdfLink.URL, source: 'crossref' }

    const primary = parsed.data.message.resource?.primary?.URL
    if (primary) return { url: primary, source: 'crossref' }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```
feat(finder): add CrossRef as PDF source
```

---

### Task 5: Implement tryOpenAlex

**Files:**
- Modify: `src/services/pdf/finder.ts`
- Test: `tests/services/pdf/pdf-finder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('OpenAlex', () => {
  it('returns OA URL from OpenAlex DOI lookup', async () => {
    // DOI, Unpaywall, CrossRef all fail
    mockFetch.mockResolvedValueOnce({ ok: false, headers: new Headers() })
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ best_oa_location: null }),
    })
    mockFetch.mockResolvedValueOnce({ ok: false })
    // OpenAlex succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        open_access: { is_oa: true, oa_url: 'https://repo.com/paper.pdf' },
        primary_location: { pdf_url: null, landing_page_url: null },
      }),
    })

    const result = await findPdf({
      doi: '10.1234/test',
      title: 'Test Paper',
      author: 'Smith',
    })

    expect(result).toEqual({ url: 'https://repo.com/paper.pdf', source: 'openalex' })
  })

  it('returns OA URL from OpenAlex title search when no DOI', async () => {
    // Semantic Scholar fails
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [] }),
    })
    // OpenAlex title search succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          open_access: { is_oa: true, oa_url: 'https://repo.com/paper.pdf' },
          primary_location: null,
        }],
      }),
    })

    const result = await findPdf({
      doi: null,
      title: 'Test Paper',
      author: 'Smith',
    })

    expect(result).toEqual({ url: 'https://repo.com/paper.pdf', source: 'openalex' })
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

- [ ] **Step 3: Implement tryOpenAlex**

```typescript
function extractOpenAlexUrl(
  data: z.infer<typeof openAlexWorkSchema>,
): string | null {
  return (
    data.primary_location?.pdf_url ??
    data.open_access?.oa_url ??
    data.primary_location?.landing_page_url ??
    null
  )
}

async function tryOpenAlexDoi(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = openAlexWorkSchema.safeParse(await res.json())
    if (!parsed.success) return null

    const url = extractOpenAlexUrl(parsed.data)
    return url ? { url, source: 'openalex' } : null
  } catch {
    return null
  }
}

async function tryOpenAlexTitle(title: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per_page=3`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = openAlexSearchSchema.safeParse(await res.json())
    if (!parsed.success) return null

    for (const work of parsed.data.results) {
      const url = extractOpenAlexUrl(work)
      if (url) return { url, source: 'openalex' }
    }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
feat(finder): add OpenAlex as PDF source (DOI + title search)
```

---

### Task 6: Implement tryCoreAc

**Files:**
- Modify: `src/services/pdf/finder.ts`
- Test: `tests/services/pdf/pdf-finder.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('CORE', () => {
  it('returns download URL from CORE when API key is set', async () => {
    // Semantic Scholar fails
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ data: [] }),
    })
    // OpenAlex title fails
    mockFetch.mockResolvedValueOnce({ ok: false })
    // CORE succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          title: 'Scalable Edge Computing',
          downloadUrl: 'https://core.ac.uk/download/pdf/12345.pdf',
          sourceFulltextUrls: [],
        }],
      }),
    })

    const result = await findPdf({
      doi: null,
      title: 'Scalable Edge Computing',
      author: 'Farrel',
    })

    expect(result).toEqual({
      url: 'https://core.ac.uk/download/pdf/12345.pdf',
      source: 'core',
    })
  })
})
```

- [ ] **Step 2: Run test, verify failure**

- [ ] **Step 3: Implement tryCoreAc**

```typescript
async function tryCoreAc(title: string): Promise<PdfFindResult | null> {
  const apiKey = env.CORE_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=3`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = coreSearchSchema.safeParse(await res.json())
    if (!parsed.success) return null

    for (const work of parsed.data.results) {
      const titleMatch = work.title
        ?.toLowerCase()
        .includes(title.toLowerCase().slice(0, 30))
      if (!titleMatch) continue

      const url = work.downloadUrl ?? work.sourceFulltextUrls[0]
      if (url) return { url, source: 'core' }
    }

    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```
feat(finder): add CORE as PDF source (title search, optional API key)
```

---

### Task 7: Update findPdf waterfall

**Files:**
- Modify: `src/services/pdf/finder.ts`
- Test: `tests/services/pdf/pdf-finder.test.ts`

- [ ] **Step 1: Write failing test for full waterfall**

```typescript
describe('extended waterfall', () => {
  it('exhausts DOI tier then title tier', async () => {
    // Tier 1: DOI, Unpaywall, CrossRef, OpenAlex-DOI all fail
    mockFetch.mockResolvedValueOnce({ ok: false, headers: new Headers() }) // DOI
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ best_oa_location: null }) }) // Unpaywall
    mockFetch.mockResolvedValueOnce({ ok: false }) // CrossRef
    mockFetch.mockResolvedValueOnce({ ok: false }) // OpenAlex DOI
    // Tier 2: Semantic Scholar fails, OpenAlex-title succeeds
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) }) // SS
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          open_access: { is_oa: true, oa_url: 'https://repo.com/found.pdf' },
          primary_location: null,
        }],
      }),
    })

    const result = await findPdf({
      doi: '10.1234/test',
      title: 'Test Paper',
      author: 'Smith',
    })

    expect(result).toEqual({ url: 'https://repo.com/found.pdf', source: 'openalex' })
    expect(mockFetch).toHaveBeenCalledTimes(6)
  })
})
```

- [ ] **Step 2: Update findPdf function**

```typescript
export async function findPdf(
  ref: FindPdfOptions,
): Promise<PdfFindResult | null> {
  // Tier 1: DOI-based (fastest, most reliable)
  if (ref.doi) {
    const doiResult = await tryDoi(ref.doi)
    if (doiResult) return doiResult

    const unpaywallResult = await tryUnpaywall(ref.doi)
    if (unpaywallResult) return unpaywallResult

    const crossRefResult = await tryCrossRef(ref.doi)
    if (crossRefResult) return crossRefResult

    const openAlexDoiResult = await tryOpenAlexDoi(ref.doi)
    if (openAlexDoiResult) return openAlexDoiResult
  }

  // Tier 2: Title-based search
  const semanticResult = await trySemanticScholar(ref.title, ref.author)
  if (semanticResult) return semanticResult

  const openAlexTitleResult = await tryOpenAlexTitle(ref.title)
  if (openAlexTitleResult) return openAlexTitleResult

  const coreResult = await tryCoreAc(ref.title)
  if (coreResult) return coreResult

  return null
}
```

- [ ] **Step 3: Update existing waterfall test**

The existing "tries DOI first, then Unpaywall, then Semantic Scholar" test needs to account for CrossRef and OpenAlex-DOI calls between Unpaywall and Semantic Scholar. Add mock responses for the new sources.

- [ ] **Step 4: Run full test suite, verify all pass**

Run: `bun test`

- [ ] **Step 5: Commit**

```
feat(finder): extend waterfall with CrossRef, OpenAlex, CORE tiers
```

---

### Task 8: Update .env.example and docs

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add CORE_API_KEY to .env.example**

- [ ] **Step 2: Commit**

```
chore: update .env.example with CORE_API_KEY
```
