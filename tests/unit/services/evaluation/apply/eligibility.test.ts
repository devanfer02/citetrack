import { describe, expect, it } from 'vitest'
import {
  defaultSelectedIds,
  hasSuggestion,
  isDefaultChecked,
  isEligible,
  isItalicFix,
  partitionEligible,
} from '#/services/evaluation/apply/eligibility'
import { makeFinding } from './helpers'

const ITALIC_RULE = 'eyd.foreign-not-italic'

describe('hasSuggestion', () => {
  it('requires both token and a non-empty suggestion', () => {
    expect(hasSuggestion(makeFinding({ token: 'kemana', suggestion: 'ke mana' }))).toBe(true)
    expect(hasSuggestion(makeFinding({ token: 'kemana', suggestion: null }))).toBe(false)
    expect(hasSuggestion(makeFinding({ token: null, suggestion: 'ke mana' }))).toBe(false)
    expect(hasSuggestion(makeFinding({ token: 'x', suggestion: '   ' }))).toBe(false)
  })
})

describe('isEligible', () => {
  it('excludes already-resolved findings', () => {
    const f = makeFinding({ token: 'a', suggestion: 'b', resolvedAt: new Date() })
    expect(isEligible(f)).toBe(false)
  })
})

describe('isDefaultChecked', () => {
  it('checks eligible EYD findings but not KBBI', () => {
    const eyd = makeFinding({ category: 'eyd', token: 'a', suggestion: 'b' })
    const kbbi = makeFinding({ category: 'kbbi', token: 'a', suggestion: 'b' })
    expect(isDefaultChecked(eyd)).toBe(true)
    expect(isDefaultChecked(kbbi)).toBe(false)
  })
})

describe('italic findings', () => {
  it('treats a foreign-not-italic finding (no suggestion) as eligible', () => {
    const f = makeFinding({ ruleId: ITALIC_RULE, token: 'framework', suggestion: null })
    expect(isItalicFix(f)).toBe(true)
    expect(hasSuggestion(f)).toBe(false)
    expect(isEligible(f)).toBe(true)
  })

  it('leaves italic findings unchecked by default', () => {
    const f = makeFinding({ ruleId: ITALIC_RULE, token: 'framework', suggestion: null })
    expect(isDefaultChecked(f)).toBe(false)
  })

  it('is not an italic fix without a token', () => {
    expect(isItalicFix(makeFinding({ ruleId: ITALIC_RULE, token: null }))).toBe(false)
  })
})

describe('partitionEligible + defaultSelectedIds', () => {
  it('splits eligible from ineligible and pre-selects only EYD', () => {
    const eyd = makeFinding({ id: 1, category: 'eyd', token: 'a', suggestion: 'b' })
    const kbbi = makeFinding({ id: 2, category: 'kbbi', token: 'c', suggestion: 'd' })
    const noSuggestion = makeFinding({ id: 3, category: 'eyd', token: 'e', suggestion: null })
    const findings = [eyd, kbbi, noSuggestion]

    const { eligible, ineligible } = partitionEligible(findings)
    expect(eligible.map((f) => f.id)).toEqual([1, 2])
    expect(ineligible.map((f) => f.id)).toEqual([3])
    expect(defaultSelectedIds(findings)).toEqual([1])
  })
})
