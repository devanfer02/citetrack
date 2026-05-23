import { query } from '@anthropic-ai/claude-agent-sdk'
import { buildPassagePrompt, parsePassageResponse } from './passage-shared'
import { preFilterPages } from './passage-matcher'

export async function matchPassageWithAgent(
  input: PassageMatchInput,
): Promise<PassageMatchResult | null> {
  const candidates = preFilterPages(input.thesisContext, input.sourcePages)
  if (candidates.length === 0) return null

  const prompt = buildPassagePrompt(input, candidates)

  try {
    let resultText = ''

    for await (const message of query({
      prompt,
      options: {
        allowedTools: [],
        maxTurns: 1,
      },
    })) {
      if ('result' in message) {
        resultText = message.result
      }
    }

    if (!resultText) return null

    return parsePassageResponse(resultText, input.citationKey)
  } catch {
    return null
  }
}
