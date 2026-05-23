# Browser Agent — PDF Scraper & Web Testing

> Use browser-use as an AI-powered browser agent for two purposes:
> 1. Last-resort PDF scraping when all API sources fail
> 2. Automated end-to-end web testing of the CiteTrack pipeline

---

## Motivation

### PDF Scraping
The current 7-source waterfall (DOI → Unpaywall → CrossRef → OpenAlex → Semantic Scholar → OpenAlex → CORE) relies on APIs that only cover open-access papers. Many Indonesian journal papers, conference proceedings, and institutional repositories have PDFs available on the web but aren't indexed by these APIs. A browser agent can search Google Scholar, publisher sites, and institutional repos to find PDFs that APIs miss.

### Web Testing
CiteTrack's pipeline spans multiple steps (upload → parse → match → fetch → AI match) with complex UI state transitions. Manual QA is slow and misses edge cases. A browser agent can execute end-to-end test scenarios by interacting with the actual UI — simulating real user behavior including file uploads, button clicks, waiting for async operations, and verifying displayed results.

---

## Integration: browser-use

### Why browser-use
- **TypeScript SDK** available (`browser-use-sdk` on npm) for cloud mode
- **Python core** available for self-hosted local mode (Playwright under the hood)
- **AI-powered** — uses natural language tasks, handles dynamic pages without brittle selectors
- **Multi-LLM** — supports Claude (already have Anthropic key), GPT-4o, or their own ChatBrowserUse model
- **Stealth** — cloud mode includes anti-bot protection, CAPTCHA solving, proxy rotation

### Two Deployment Modes

| Mode | Use Case | Dependency | Cost |
|------|----------|------------|------|
| **Cloud SDK** (`browser-use-sdk`) | PDF scraping in production | npm package, API key | Paid per task |
| **Local Python** (`browser-use`) | Development testing, self-hosted scraping | Python 3.11+, Playwright | Free (LLM costs only) |

---

## Part 1: PDF Scraping Agent

### Architecture

Add as the **final source** in the PDF finder waterfall:

```
Tier 1 (DOI-based): DOI → Unpaywall → CrossRef → OpenAlex
Tier 2 (title-based): Semantic Scholar → OpenAlex → CORE
Tier 3 (browser): Browser Agent → Google Scholar / publisher sites
```

The browser agent only runs when all 7 API sources fail — it's the last resort before marking a reference as "not found."

### Implementation Plan

#### Option A: Cloud SDK (Recommended for production)

```typescript
// src/services/pdf/browser-agent.ts
import { BrowserUse } from 'browser-use-sdk/v3'

async function tryBrowserAgent(title: string, author: string): Promise<PdfFindResult | null> {
  const apiKey = env.BROWSER_USE_API_KEY
  if (!apiKey) return null

  const client = new BrowserUse({ apiKey })
  const result = await client.run({
    task: `Search Google Scholar for the paper "${title}" by ${author}.
           Find a direct PDF download link. If the first result doesn't have a PDF,
           check Sci-Hub, ResearchGate, or the publisher's website.
           Return ONLY the direct PDF URL, nothing else.`,
    maxSteps: 10,
  })

  if (result.output && result.output.startsWith('http')) {
    return { url: result.output, source: 'browser-agent' }
  }
  return null
}
```

#### Option B: Local Python sidecar (for self-hosted)

Run browser-use as a Python subprocess or local HTTP service:

```bash
# Install
pip install browser-use playwright
playwright install chromium
```

```python
# scripts/pdf-scraper.py — simple HTTP server
from fastapi import FastAPI
from browser_use import Agent
from langchain_anthropic import ChatAnthropic

app = FastAPI()
llm = ChatAnthropic(model="claude-sonnet-4-20250514")

@app.post("/find-pdf")
async def find_pdf(title: str, author: str):
    agent = Agent(
        task=f'Find a PDF download link for "{title}" by {author} on Google Scholar',
        llm=llm,
        max_steps=10,
    )
    result = await agent.run()
    return {"url": result.final_result() if result.is_done() else None}
```

```typescript
// src/services/pdf/browser-agent.ts — calls local sidecar
async function tryBrowserAgent(title: string, author: string): Promise<PdfFindResult | null> {
  const endpoint = env.BROWSER_AGENT_URL // e.g., http://localhost:8100
  if (!endpoint) return null

  const res = await fetch(`${endpoint}/find-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author }),
    signal: AbortSignal.timeout(60000), // browser tasks take longer
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.url ? { url: data.url, source: 'browser-agent' } : null
}
```

### Environment Variables

```bash
# Option A: Cloud SDK
BROWSER_USE_API_KEY=          # browser-use cloud API key

# Option B: Local sidecar
BROWSER_AGENT_URL=            # e.g., http://localhost:8100
```

### Schema Changes

Add `'browser-agent'` to `fetchSourceEnum` in `src/db/schema.ts` and `fetchSourceSchema` in `src/schemas/pdf-finder.ts`.

### Rate Limiting & Safety

- Max 1 concurrent browser task (browser agent is resource-heavy)
- 60-second timeout per task (vs 10s for API sources)
- Only triggered after ALL API sources fail
- Respect robots.txt and publisher terms of service
- Log every browser task for audit trail

---

## Part 2: Automated Web Testing

### Purpose

Use browser-use to run end-to-end tests against the live CiteTrack app, simulating real user interactions:

1. **Upload flow** — upload a test PDF, verify extraction completes
2. **Pipeline flow** — click through all steps (parse → match → fetch → AI match), verify each step produces expected results
3. **Results validation** — verify the results dashboard shows correct data
4. **Error handling** — upload invalid files, trigger edge cases, verify graceful errors

### Test Architecture

```
tests/
├── e2e/
│   ├── setup.py               # browser-use agent setup
│   ├── test_upload_flow.py     # upload + extraction tests
│   ├── test_pipeline.py        # full pipeline end-to-end
│   ├── test_results.py         # results dashboard validation
│   ├── test_errors.py          # error handling scenarios
│   └── fixtures/
│       └── 14484.pdf           # test thesis PDF (symlink to docs/train/)
```

### Example Test

```python
# tests/e2e/test_pipeline.py
from browser_use import Agent
from langchain_anthropic import ChatAnthropic

async def test_full_pipeline():
    """Upload test PDF and verify complete pipeline produces expected results."""
    llm = ChatAnthropic(model="claude-sonnet-4-20250514")

    agent = Agent(
        task="""
        1. Go to http://localhost:3000/upload
        2. Upload the file at tests/e2e/fixtures/14484.pdf
        3. Wait for text extraction to complete
        4. Click "Parse References →"
        5. Verify that at least 9 references are found
        6. Click "Match Citations →"
        7. Verify that at least 8 citations are matched
        8. Take a screenshot of the matching results
        9. Report: number of matched, unmatched, and unused references
        """,
        llm=llm,
        max_steps=20,
    )

    result = await agent.run()
    assert "matched" in result.final_result().lower()
```

### Running Tests

```bash
# Prerequisites
pip install browser-use playwright pytest-asyncio
playwright install chromium

# Run with dev server active
bun run dev &  # start CiteTrack on :3000
python -m pytest tests/e2e/ -v
```

### CI Integration

```yaml
# .github/workflows/e2e.yml (future)
- name: Start dev server
  run: bun run dev &

- name: Install browser-use
  run: pip install browser-use playwright && playwright install chromium

- name: Run E2E tests
  run: python -m pytest tests/e2e/ -v
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## Implementation Priority

### Phase 1: PDF Scraping (v0.2)
- [ ] Add `browser-agent` to fetch source enum
- [ ] Implement `tryBrowserAgent()` with cloud SDK
- [ ] Add as final waterfall source in `findPdf()`
- [ ] Add `BROWSER_USE_API_KEY` to env config
- [ ] Test with references that fail all API sources

### Phase 2: E2E Testing (v0.2)
- [ ] Set up Python test environment with browser-use
- [ ] Write upload flow test
- [ ] Write full pipeline test with 14484.pdf
- [ ] Write results validation test
- [ ] Write error handling tests

### Phase 3: Self-Hosted Sidecar (v0.3)
- [ ] Python FastAPI sidecar for local browser-use
- [ ] Docker compose service for the sidecar
- [ ] `BROWSER_AGENT_URL` env var for sidecar mode
- [ ] Fallback between cloud SDK and local sidecar

---

## Alternatives Considered

| Tool | Language | Self-hosted | Anti-bot | Decision |
|------|----------|-------------|----------|----------|
| **browser-use** | Python + TS SDK | Yes | Cloud: excellent | **Selected** — best AI agent, dual mode |
| Stagehand | TypeScript | Yes | Basic | Good TS-native option, weaker anti-bot |
| Playwright (raw) | TypeScript | Yes | None | Too brittle for dynamic scraping |
| Puppeteer | TypeScript | Yes | None | Same as Playwright |
| SerpAPI | TypeScript | No | N/A | Already in original plan, limited to Google Scholar metadata only |

browser-use was selected because:
1. Cloud SDK for production (handles CAPTCHAs, proxies, stealth)
2. Local Python for testing (free, no cloud dependency)
3. AI-powered — adapts to page layout changes without brittle selectors
4. Dual use — both scraping AND testing with the same tool
