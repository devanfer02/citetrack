#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Typo from 'typo-js'
import { db } from '#/db'
import { sql } from 'drizzle-orm'

type RawFinding = {
  id: number
  token: string
  message: string
  suggestion: string | null
  rule_id: string
  page_number: number | null
  offset: number | null
  length: number | null
  excerpt_preview: string | null
}

type ReasonClass =
  | 'english-loanword'
  | 'proper-noun'
  | 'identifier-acronym'
  | 'abbreviation'
  | 'missed-by-morphology'
  | 'tokenization-noise'
  | 'short-particle'
  | 'genuine-misspelling-typo'
  | 'genuine-missing-space'
  | 'genuine-loanword-no-kbbi-equivalent'

type Classification = {
  token: string
  lowered: string
  cased_variants: string[]
  occurrences: number
  suggestion: string | null
  verdict: 'TP' | 'FP'
  reason: ReasonClass
  rationale: string
}

const ITER_NN = process.argv[2] ?? 'iter-01'
const ITER_DIR = resolve(process.cwd(), 'docs/train/iterations', ITER_NN)

const ACADEMIC_ABBREVS = new Set([
  'dkk', 'dsb', 'dll', 'dst', 'yth', 'tsb',
  'et', 'al', 'pp', 'vol', 'no', 'ed',
  'fig', 'tab', 'eq', 'ref',
])

const ENGLISH_LETTER_PATTERNS = [
  /tion$/, /ing$/, /ment$/, /able$/, /ible$/, /sion$/, /ness$/,
  /^wh/, /qu/, /^th/, /ph/, /ck$/, /sh$/, /ph[aeiou]/, /^pre/, /^anti/,
]

const AFFIX_PREFIXES = [
  'menge', 'meng', 'meny', 'mem', 'men', 'me',
  'penge', 'peng', 'pen', 'pem', 'pe',
  'ber', 'be',
  'ter',
  'di',
  'ke',
  'se',
  'antar', 'antara',
  'sub', 'non', 'pra', 'pasca', 'multi', 'inter', 'kontra',
]

const AFFIX_SUFFIXES = [
  'nya', 'lah', 'kah', 'pun',
  'kannya', 'inya',
  'isasi', 'itas', 'tif', 'wan', 'wati',
  'kan', 'an', 'i',
]

const stripOnce = (word: string): string[] => {
  const out: string[] = []
  for (const p of AFFIX_PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 3) {
      out.push(word.slice(p.length))
    }
  }
  for (const s of AFFIX_SUFFIXES) {
    if (word.endsWith(s) && word.length - s.length >= 3) {
      out.push(word.slice(0, -s.length))
    }
  }
  return out
}

const allStems = (word: string): string[] => {
  const seen = new Set<string>([word])
  const queue = [word]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of stripOnce(cur)) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return [...seen]
}

let dictionarySet: Set<string> | null = null
const inDictionary = async (word: string): Promise<boolean> => {
  if (!dictionarySet) {
    const rows = await db.execute<{ word: string }>(
      sql`SELECT lower(trim(word)) AS word FROM dictionary`,
    )
    dictionarySet = new Set(rows.rows.map((r) => r.word))
  }
  return dictionarySet.has(word.toLowerCase())
}

const typo = new Typo('en_US')
const isEnglish = (word: string): boolean => {
  const w = word.toLowerCase()
  if (w.length < 3) return false
  return typo.check(w)
}

const matchesEnglishLetterPattern = (word: string): boolean => {
  const w = word.toLowerCase()
  return ENGLISH_LETTER_PATTERNS.some((re) => re.test(w))
}

const isLikelyConcatenation = (word: string): boolean => {
  if (word.length < 10) return false
  const lower = word.toLowerCase()
  for (let i = 4; i <= word.length - 4; i++) {
    const left = lower.slice(0, i)
    const right = lower.slice(i)
    if (dictionarySet?.has(left) && dictionarySet?.has(right)) return true
  }
  return false
}

const classify = async (
  token: string,
  occurrences: number,
  suggestion: string | null,
  casedVariants: string[],
): Promise<Classification> => {
  const lowered = token.toLowerCase()
  const result = (
    verdict: 'TP' | 'FP',
    reason: ReasonClass,
    rationale: string,
  ): Classification => ({
    token,
    lowered,
    cased_variants: casedVariants,
    occurrences,
    suggestion,
    verdict,
    reason,
    rationale,
  })

  // Rule 6: tokenization noise (1-char or hyphenation artifact)
  if (lowered.length <= 1 || /^[-‑−]+$/.test(lowered)) {
    return result('FP', 'tokenization-noise', 'single char or hyphen artifact')
  }

  // Rule 7: short particle (length <= 2)
  if (lowered.length <= 2) {
    return result('FP', 'short-particle', `length ${lowered.length}, likely particle or fragment`)
  }

  // Rule 4: academic abbreviation
  const stripped = lowered.replace(/[^\w]/g, '')
  if (ACADEMIC_ABBREVS.has(stripped)) {
    return result('FP', 'abbreviation', `matches academic abbreviation "${stripped}"`)
  }

  // Rule 3: identifier / acronym
  if (/[_\d]/.test(token) || (token === token.toUpperCase() && token.length >= 3 && /[a-zA-Z]/.test(token))) {
    return result('FP', 'identifier-acronym', 'contains digits/underscores or is all-uppercase')
  }

  // Rule 1: English loanword (typo-js or letter patterns)
  if (isEnglish(lowered)) {
    return result('FP', 'english-loanword', 'matches en_US Hunspell dictionary')
  }
  if (matchesEnglishLetterPattern(lowered) && lowered.length >= 5) {
    // Stronger evidence needed: pattern match alone isn't enough.
    // Require also: not a KBBI base form
    const stems = allStems(lowered)
    const anyStemKnown = await Promise.all(stems.map(inDictionary)).then((r) =>
      r.some(Boolean),
    )
    if (!anyStemKnown) {
      return result(
        'FP',
        'english-loanword',
        `letter-pattern looks English (${ENGLISH_LETTER_PATTERNS.find((re) => re.test(lowered))?.source}) and no KBBI stem matches`,
      )
    }
  }

  // Rule 2: proper noun (capitalized variant exists, no lowercase variant)
  const hasUpperVariant = casedVariants.some((v) => /^[A-Z]/.test(v))
  const hasLowerVariant = casedVariants.some((v) => /^[a-z]/.test(v))
  if (hasUpperVariant && !hasLowerVariant && occurrences >= 1) {
    // Only-uppercase appearance + plausible proper noun form
    if (/^[A-Z][a-z]+/.test(casedVariants[0])) {
      return result('FP', 'proper-noun', 'appears only capitalized, plausible proper noun')
    }
  }

  // Rule 5: missed by morphology — check stems against KBBI dictionary
  const stems = allStems(lowered)
  for (const stem of stems) {
    if (stem === lowered) continue
    if (stem.length < 3) continue
    if (await inDictionary(stem)) {
      return result(
        'FP',
        'missed-by-morphology',
        `stripped to "${stem}" which is in KBBI`,
      )
    }
  }

  // Concatenation typo (missing-space): two KBBI words joined
  if (isLikelyConcatenation(lowered)) {
    return result('TP', 'genuine-missing-space', 'splits into two KBBI words — likely missing space')
  }

  // Otherwise: genuine — distinguish typo vs loanword-without-equivalent
  if (suggestion && suggestion.length > 0) {
    // KBBI suggester found a close match → real misspelling
    return result('TP', 'genuine-misspelling-typo', `KBBI suggests "${suggestion}"`)
  }
  // No suggestion, not in dictionary, not English, not proper noun, not derived → loanword/jargon
  return result('TP', 'genuine-loanword-no-kbbi-equivalent', 'unknown to KBBI, no suggestion, not English — jargon/loanword')
}

const main = async () => {
  const findingsPath = resolve(ITER_DIR, 'findings.json')
  const raw = JSON.parse(await readFile(findingsPath, 'utf-8')) as RawFinding[]
  console.log(`Loaded ${raw.length} findings from ${findingsPath}`)

  // Group by lowercased token
  const byToken = new Map<
    string,
    { token: string; cased: Set<string>; suggestions: Set<string>; occurrences: number }
  >()
  for (const f of raw) {
    if (!f.token) continue
    const lowered = f.token.toLowerCase()
    if (!byToken.has(lowered)) {
      byToken.set(lowered, {
        token: f.token,
        cased: new Set([f.token]),
        suggestions: new Set(),
        occurrences: 0,
      })
    }
    const entry = byToken.get(lowered)!
    entry.cased.add(f.token)
    if (f.suggestion) entry.suggestions.add(f.suggestion)
    entry.occurrences += 1
  }
  console.log(`Unique lowercased tokens: ${byToken.size}`)

  // Warm dictionary set
  await inDictionary('test-warm')
  console.log(`Dictionary loaded: ${dictionarySet?.size} entries`)

  const classified: Classification[] = []
  for (const entry of byToken.values()) {
    const suggestion = entry.suggestions.size > 0 ? [...entry.suggestions][0] : null
    const c = await classify(
      entry.token,
      entry.occurrences,
      suggestion,
      [...entry.cased],
    )
    classified.push(c)
  }

  classified.sort((a, b) => b.occurrences - a.occurrences || a.lowered.localeCompare(b.lowered))

  await writeFile(
    resolve(ITER_DIR, 'classified.json'),
    JSON.stringify(classified, null, 2),
  )

  // Summary
  const totalUnique = classified.length
  const fp = classified.filter((c) => c.verdict === 'FP')
  const tp = classified.filter((c) => c.verdict === 'TP')
  const fpRate = fp.length / totalUnique

  const fpByClass = new Map<ReasonClass, Classification[]>()
  for (const c of fp) {
    if (!fpByClass.has(c.reason)) fpByClass.set(c.reason, [])
    fpByClass.get(c.reason)!.push(c)
  }
  const tpByClass = new Map<ReasonClass, Classification[]>()
  for (const c of tp) {
    if (!tpByClass.has(c.reason)) tpByClass.set(c.reason, [])
    tpByClass.get(c.reason)!.push(c)
  }

  const summary: string[] = []
  summary.push(`# Iter ${ITER_NN} — FP Summary`)
  summary.push('')
  summary.push(`- **Total findings (records):** ${raw.length}`)
  summary.push(`- **Unique flagged tokens (lowercased):** ${totalUnique}`)
  summary.push(`- **TP (genuine):** ${tp.length}`)
  summary.push(`- **FP (false positive):** ${fp.length}`)
  summary.push(`- **FP rate (per-unique-word):** ${(fpRate * 100).toFixed(1)}%`)
  summary.push(`- **Stop target:** ≤ 15.0%`)
  summary.push('')
  summary.push('## FP breakdown by reason')
  summary.push('')
  summary.push('| Reason | Count | Share of FPs | Example tokens |')
  summary.push('|--------|-------|---------------|----------------|')
  const sortedFpClasses = [...fpByClass.entries()].toSorted((a, b) => b[1].length - a[1].length)
  for (const [reason, items] of sortedFpClasses) {
    const share = ((items.length / fp.length) * 100).toFixed(1)
    const examples = items.slice(0, 5).map((c) => `\`${c.token}\``).join(', ')
    summary.push(`| ${reason} | ${items.length} | ${share}% | ${examples} |`)
  }
  summary.push('')
  summary.push('## TP breakdown by reason')
  summary.push('')
  summary.push('| Reason | Count | Example tokens |')
  summary.push('|--------|-------|----------------|')
  const sortedTpClasses = [...tpByClass.entries()].toSorted((a, b) => b[1].length - a[1].length)
  for (const [reason, items] of sortedTpClasses) {
    const examples = items.slice(0, 5).map((c) => `\`${c.token}\``).join(', ')
    summary.push(`| ${reason} | ${items.length} | ${examples} |`)
  }
  summary.push('')
  summary.push('## All FPs (full list)')
  summary.push('')
  for (const c of fp) {
    summary.push(`- **${c.token}** × ${c.occurrences} — ${c.reason} — ${c.rationale}`)
  }
  summary.push('')
  summary.push('## All TPs (full list)')
  summary.push('')
  for (const c of tp) {
    summary.push(`- **${c.token}** × ${c.occurrences} — ${c.reason} — ${c.rationale}${c.suggestion ? ` (suggest: ${c.suggestion})` : ''}`)
  }

  await writeFile(resolve(ITER_DIR, 'fp_summary.md'), summary.join('\n') + '\n')

  console.log(`\nResults:`)
  console.log(`  Unique tokens: ${totalUnique}`)
  console.log(`  TP: ${tp.length}`)
  console.log(`  FP: ${fp.length}`)
  console.log(`  FP rate: ${(fpRate * 100).toFixed(1)}% (target ≤ 15.0%)`)
  console.log(`\nFP breakdown:`)
  for (const [reason, items] of sortedFpClasses) {
    console.log(`  ${reason}: ${items.length}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
