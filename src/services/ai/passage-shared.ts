import { passageMatchResponseSchema } from '#/schemas/passage-match'

export const MAX_PAGE_CHARS = 3000

export function buildPassagePrompt(
  input: PassageMatchInput,
  candidates: SourcePage[],
): string {
  const pagesText = candidates
    .map(
      (p) =>
        `Page ${p.pageNumber}: "${p.content.slice(0, MAX_PAGE_CHARS)}"`,
    )
    .join('\n\n')

  return `You are a citation verification assistant. Find the exact passage in a source document that a thesis is citing.

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

export function parsePassageResponse(
  text: string,
  citationKey: string,
): PassageMatchResult | null {
  try {
    const jsonStr = text.replace(/```json?\s*|\s*```/g, '').trim()
    const parsed = passageMatchResponseSchema.safeParse(JSON.parse(jsonStr))

    if (!parsed.success) return null

    return {
      citationKey,
      sourcePage: parsed.data.page,
      matchedPassage: parsed.data.passage,
      confidence: parsed.data.confidence,
      reasoning: parsed.data.reasoning,
    }
  } catch {
    return null
  }
}
