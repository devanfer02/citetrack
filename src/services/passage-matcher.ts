import { getAnthropicClient } from '#/lib/claude'
import {
  passageMatchResponseSchema,
  type PassageMatchResponse,
} from '#/schemas/passage-match'

interface SourcePage {
  pageNumber: number
  content: string
}

export interface PassageMatchInput {
  citationKey: string
  thesisContext: string
  sourcePages: SourcePage[]
}

export interface PassageMatchResult {
  citationKey: string
  sourcePage: number
  matchedPassage: string
  confidence: number
  reasoning: string
}

const MAX_CANDIDATE_PAGES = 10
const MAX_PAGE_CHARS = 3000

export function extractKeywords(text: string): string[] {
  const words = text.split(/\s+/)
  const keywords: string[] = []

  for (const word of words) {
    const clean = word.replace(/[.,;:!?()"']/g, '')
    if (!clean) continue

    // Proper nouns (capitalized, not at sentence start)
    if (/^[A-Z][a-z]+/.test(clean) && clean.length > 2) {
      keywords.push(clean.toLowerCase())
    }

    // Numbers (years, page numbers, statistics)
    if (/\d{2,}/.test(clean)) {
      keywords.push(clean)
    }

    // Technical terms / acronyms
    if (/^[A-Z]{2,}$/.test(clean)) {
      keywords.push(clean.toLowerCase())
    }
  }

  return [...new Set(keywords)]
}

export function scorePageRelevance(
  keywords: string[],
  pageContent: string,
): number {
  if (keywords.length === 0) return 0
  const lower = pageContent.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++
  }
  return hits / keywords.length
}

export function preFilterPages(
  thesisContext: string,
  sourcePages: SourcePage[],
  maxPages: number = MAX_CANDIDATE_PAGES,
): SourcePage[] {
  const keywords = extractKeywords(thesisContext)

  if (keywords.length === 0) {
    return sourcePages.slice(0, maxPages)
  }

  const scored = sourcePages
    .map((p) => ({ page: p, score: scorePageRelevance(keywords, p.content) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return sourcePages.slice(0, maxPages)
  }

  return scored.slice(0, maxPages).map((s) => s.page)
}

function buildPrompt(input: PassageMatchInput, candidates: SourcePage[]): string {
  const pagesText = candidates
    .map(
      (p) =>
        `Page ${p.pageNumber}: "${p.content.slice(0, MAX_PAGE_CHARS)}"`,
    )
    .join('\n\n')

  return `You are a citation verification assistant. Your job is to find the exact passage in a source document that a thesis is citing.

THESIS CONTEXT:
"${input.thesisContext}"

CITATION: ${input.citationKey}

SOURCE PDF PAGES:
${pagesText}

Which page contains the information that the thesis is citing? Find the most relevant passage.

Return ONLY valid JSON (no markdown, no code fences):
{
  "page": <page number>,
  "passage": "<exact relevant passage from the source, 1-3 sentences>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation of why this passage matches the citation>"
}

If no page contains relevant information, return confidence 0.0 and explain why in reasoning.`
}

export async function matchPassage(
  input: PassageMatchInput,
): Promise<PassageMatchResult | null> {
  const candidates = preFilterPages(input.thesisContext, input.sourcePages)

  if (candidates.length === 0) return null

  const prompt = buildPrompt(input, candidates)

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Strip markdown code fences if present
    const jsonStr = text.replace(/```json?\s*|\s*```/g, '').trim()

    const parsed = passageMatchResponseSchema.safeParse(JSON.parse(jsonStr))

    if (!parsed.success) return null

    return {
      citationKey: input.citationKey,
      sourcePage: parsed.data.page,
      matchedPassage: parsed.data.passage,
      confidence: parsed.data.confidence,
      reasoning: parsed.data.reasoning,
    }
  } catch {
    return null
  }
}
