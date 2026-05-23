import { env } from '#/env'
import { matchPassage } from './passage-matcher'
import { matchPassageWithAgent } from './passage-matcher-agent'

export class MatcherDisabledError extends Error {
  constructor() {
    super(
      'Passage matching is disabled. Set MATCHER_STRATEGY to "api" or "agent" in .env.local and restart the dev server.',
    )
    this.name = 'MatcherDisabledError'
  }
}

export async function matchPassageAuto(
  input: PassageMatchInput,
): Promise<PassageMatchResult | null> {
  if (env.MATCHER_STRATEGY === 'none') {
    throw new MatcherDisabledError()
  }
  if (env.MATCHER_STRATEGY === 'agent') {
    return matchPassageWithAgent(input)
  }
  return matchPassage(input)
}
