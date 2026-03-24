# Competitor Analysis

## The Landscape

There are tools that do **parts** of what Citation Tracer aims to do, but **none do the full pipeline end-to-end**, especially with cross-language support. Here's the breakdown:

---

## 1. RefChecker (by Mark Russinovich)
**GitHub:** `markrussinovich/refchecker` · **Stack:** Python · **Stars:** Popular, recently built

**What it does:**
Verifies citation metadata (titles, authors, years, DOIs) against Semantic Scholar, OpenAlex, and CrossRef. LLM-powered extraction. Detects hallucinated references.

**Weaknesses for your use case:**
- ❌ **Metadata-only** — checks if "Tanenbaum, 2021" exists and if the title/author/year match, but does NOT open the source PDF to find which page you cited
- ❌ **No page-level tracing** — doesn't answer "what passage did I actually use?"
- ❌ **No cross-language support** — designed for English papers citing English papers
- ❌ **CLI-only** — has a web UI but it's a basic local Streamlit/Flask app, not a polished web experience
- ❌ **Python-heavy** — not easily deployable as a lightweight web service

**What to steal:** Their waterfall verification strategy (Semantic Scholar → OpenAlex → CrossRef) is solid. Consider using the same API priority.

---

## 2. SemanticCite (by Sebastian Haan)
**GitHub:** `sebhaan/SemanticCite` · **Stack:** Python, Streamlit · **Paper:** arXiv 2511.16198

**What it does:**
The closest competitor. Full-text citation verification using hybrid retrieval (BM25 + dense embeddings + neural reranking). 4-class classification: Supported / Partially Supported / Unsupported / Uncertain. Returns evidence snippets + confidence scores.

**Weaknesses for your use case:**
- ❌ **No auto PDF fetching** — user must manually upload or provide URL for each reference document. For a thesis with 30+ references, this is brutal
- ❌ **No cross-language matching** — designed for same-language verification (English→English)
- ❌ **Heavy setup** — requires Conda env, local embedding models, Ollama or API keys. Not "upload and go"
- ❌ **One citation at a time** — no batch processing of an entire thesis in one shot
- ❌ **Streamlit UI** — functional but not a great UX. No progress tracking, no export
- ❌ **No page number output** — returns text snippets but doesn't tell you "page 42 of the PDF"
- ✅ Does do semantic matching (their core strength)

**What to steal:** Their hybrid retrieval approach (BM25 + dense vectors + reranking) is academically validated. If you ever move beyond Claude API to self-hosted, this is the architecture to follow.

---

## 3. contentanalysis (by Massimo Aria)
**GitHub:** `massimoaria/contentanalysis` · **Stack:** R

**What it does:**
Extracts citations from PDFs, links in-text citations to references, enriches metadata via CrossRef/OpenAlex, creates citation network visualizations.

**Weaknesses for your use case:**
- ❌ **R-only** — not a web tool, it's an R package for researchers
- ❌ **No source PDF fetching or reading** — only analyzes the thesis itself, doesn't open referenced papers
- ❌ **No semantic matching** — matching is author/year string-based only
- ❌ **No cross-language** — no translation or multilingual understanding
- ❌ **No page-level tracing** at all

**What to steal:** Their citation detection handles multiple formats well (narrative, parenthetical, complex multi-author). Look at their regex patterns for parsing edge cases like `(see Breiman, 1996)` or `Hastie et al. (2009)`.

---

## 4. citation-graph-builder (FZJ-IEK3)
**GitHub:** `FZJ-IEK3-VSA/citation-graph-builder` · **Stack:** Python, GROBID

**What it does:**
Builds citation network graphs by parsing PDFs with GROBID and cross-referencing with bibliographic APIs.

**Weaknesses for your use case:**
- ❌ **Visualization tool, not verification** — it maps relationships, doesn't trace content
- ❌ **Requires GROBID server** — heavy Java dependency
- ❌ **No semantic matching or page-level tracing**
- ❌ **No cross-language**

**What to steal:** GROBID is very good at structured reference extraction from PDFs if you ever need a fallback beyond regex.

---

## 5. SaaS Products (Scite.ai, Citely, Paperpal, Recite)

**Scite.ai** — The commercial leader. Has "Smart Citations" that classify whether later papers support or contradict a finding. 1.6B+ citations indexed. But it's about how OTHER papers cite a work, not about tracing YOUR citations back to source pages.

**Citely** — Checks if citations are real (not hallucinated). Metadata verification. No page-level tracing.

**Recite** — Checks APA/Harvard format consistency between in-text and reference list. No semantic analysis at all.

**Paperpal/Sourcely** — Source discovery tools (find papers to cite), not verification of existing citations.

**Common weaknesses across all SaaS:**
- ❌ None trace back to specific pages in the source PDF
- ❌ None handle cross-language (Indonesian thesis → English source)
- ❌ Most are paid with limited free tiers
- ❌ None are open-source or self-hostable

---

## Gap Analysis: Where Citation Tracer Wins

| Feature | RefChecker | SemanticCite | contentanalysis | SaaS Tools | **Citation Tracer** |
|---|---|---|---|---|---|
| Parse thesis citations | ✅ | ✅ | ✅ | ✅ | ✅ |
| Verify metadata exists | ✅ | ❌ | ✅ | ✅ | ✅ |
| Auto-fetch source PDFs | ❌ | ❌ | ❌ | N/A | ✅ |
| Page-level tracing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Passage extraction | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cross-language matching | ❌ | ❌ | ❌ | ❌ | ✅ |
| Batch full-thesis processing | ⚠️ CLI | ❌ | ✅ | ❌ | ✅ |
| Web UI with progress | ❌ | ⚠️ Streamlit | ❌ | ✅ | ✅ |
| Export results | ✅ | ❌ | ✅ | ⚠️ | ✅ |
| Lightweight setup | ❌ | ❌ | ❌ | ✅ | ✅ |

**Your unique value proposition in one line:**
> "Upload your thesis → get a complete map showing exactly which page and passage from each source paper you cited, even when your thesis is in Indonesian and the source is in English."

Nobody does this. Not even close.

---

## Risks & Things to Watch

1. **PDF access** — Many papers are behind paywalls. Unpaywall + Semantic Scholar covers open-access well, but some sources simply won't have freely available PDFs. The manual upload fallback is essential.

2. **SemanticCite could add auto-fetch** — It's the closest architecturally. If they add PDF fetching and batch processing, they become a direct competitor. But they're Python/academic-focused, not building for web UX.

3. **Scite.ai has the data moat** — 1.6B citations indexed with publisher agreements. You can't compete on scale, but you're not trying to. You're solving a different, more specific problem.

4. **Citation parsing edge cases** — Indonesian academic writing has quirks (e.g., `(dalam Tanenbaum, 2021)` meaning "in Tanenbaum, 2021"). Your regex needs to handle these Bahasa-specific patterns that no existing tool accounts for.