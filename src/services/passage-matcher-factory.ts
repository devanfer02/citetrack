import { env } from '#/env'
import { matchPassage } from './passage-matcher'
import { matchPassageWithAgent } from './passage-matcher-agent'

export async function matchPassageAuto(
  input: PassageMatchInput,
): Promise<PassageMatchResult | null> {
  if (env.MATCHER_STRATEGY === 'agent') {
    return matchPassageWithAgent(input)
  }
  return matchPassage(input)
}
