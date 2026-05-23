#!/usr/bin/env bun
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import {
  groupCitations,
  parseCitationsFromPages,
} from '#/services/parser/citation-parser'
import { parseReferences } from '#/services/parser/reference-parser'
import { matchCitations } from '#/services/matcher/citation-matcher'

const THESIS_PDF = resolve(process.cwd(), '.claude/pdf_examples/thesis_example.pdf')
const JOURNAL_PDF = resolve(process.cwd(), '.claude/pdf_examples/14484.pdf')
const ITER_ROOT = resolve(process.cwd(), 'docs/train/track-iterations')

interface RefLite {
  id: number
  author: string
  year: string
  title: string
  rawText: string
}

interface GroupedLite {
  citationKey: string
  count: number
  firstPage: number | null
  contextExcerpt: string
}

interface IterationResult {
  pdf: string
  stats: {
    citationsTotal: number
    citationsUnique: number
    references: number
    matchedUnique: number
    matchRate: number
    orphans: number
    unused: number
  }
  references: RefLite[]
  grouped: GroupedLite[]
  matches: MatchResult[]
  orphans: string[]
  unused: { id: number; author: string; year: string; title: string }[]
}

const nextIterNumber = async (): Promise<number> => {
  if (!existsSync(ITER_ROOT)) return 1
  const entries = await readdir(ITER_ROOT)
  const nums = entries
    .map((n) => /^iter-(\d+)$/.exec(n)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number)
  return (nums.length ? Math.max(...nums) : 0) + 1
}

const pad2 = (n: number): string => n.toString().padStart(2, '0')

async function runPipeline(
  pdfPath: string,
  label: string,
): Promise<IterationResult> {
  const buf = await readFile(pdfPath)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  const citations = parseCitationsFromPages(pages)
  const grouped = groupCitations(citations)
  const references = parseReferences(pages)
  const refEntries = references.map((r, i) => ({
    id: i + 1,
    author: r.author,
    year: r.year,
    title: r.title,
  }))
  const uniqueKeys = [...new Set(citations.map((c) => c.citationKey))]
  const matchSummary = matchCitations(uniqueKeys, refEntries)
  const matched = matchSummary.matches.filter(
    (m) => m.matchType !== 'unmatched',
  ).length

  return {
    pdf: label,
    stats: {
      citationsTotal: citations.length,
      citationsUnique: grouped.length,
      references: references.length,
      matchedUnique: matched,
      matchRate: grouped.length === 0 ? 0 : matched / grouped.length,
      orphans: matchSummary.orphanCitations.length,
      unused: matchSummary.unusedReferences.length,
    },
    references: references.map((r, i) => ({
      id: i + 1,
      author: r.author,
      year: r.year,
      title: r.title,
      rawText: r.rawText,
    })),
    grouped: grouped.map((g) => ({
      citationKey: g.citationKey,
      count: g.count,
      firstPage: g.occurrences[0]?.thesisPage ?? null,
      contextExcerpt:
        g.occurrences[0]?.thesisContext?.slice(0, 160).replace(/\s+/g, ' ') ??
        '',
    })),
    matches: matchSummary.matches,
    orphans: matchSummary.orphanCitations,
    unused: matchSummary.unusedReferences,
  }
}

function renderSummary(
  results: IterationResult[],
  prior: Map<string, IterationResult> | null,
): string {
  const lines: string[] = []
  lines.push(`# Track pipeline iteration`)
  lines.push('')
  for (const r of results) {
    const p = prior?.get(r.pdf)
    lines.push(`## ${r.pdf}`)
    lines.push('')
    lines.push('| metric | value' + (p ? ' | Δ prev |' : ' |'))
    lines.push('|---|---' + (p ? '|---|' : '|'))
    const row = (k: string, v: number, prevV?: number): string => {
      const delta = p && prevV !== undefined ? v - prevV : null
      const sign = delta === null ? '' : delta > 0 ? `+${delta}` : `${delta}`
      return `| ${k} | ${v}` + (p ? ` | ${sign} |` : ' |')
    }
    lines.push(row('citations.total', r.stats.citationsTotal, p?.stats.citationsTotal))
    lines.push(row('citations.unique', r.stats.citationsUnique, p?.stats.citationsUnique))
    lines.push(row('references', r.stats.references, p?.stats.references))
    lines.push(row('matched.unique', r.stats.matchedUnique, p?.stats.matchedUnique))
    lines.push(
      `| match.rate | ${(r.stats.matchRate * 100).toFixed(1)}%` +
        (p
          ? ` | ${((r.stats.matchRate - p.stats.matchRate) * 100).toFixed(1)}pp |`
          : ' |'),
    )
    lines.push(row('orphans', r.stats.orphans, p?.stats.orphans))
    lines.push(row('unused.refs', r.stats.unused, p?.stats.unused))
    lines.push('')

    if (r.orphans.length > 0) {
      lines.push(`### Orphan citations (${r.orphans.length})`)
      lines.push('')
      const priorSet = new Set(p?.orphans ?? [])
      for (const key of r.orphans) {
        const mark = p ? (priorSet.has(key) ? '' : ' 🆕') : ''
        lines.push(`- \`${key}\`${mark}`)
      }
      if (p) {
        const resolved = [...priorSet].filter((k) => !r.orphans.includes(k))
        if (resolved.length > 0) {
          lines.push('')
          lines.push(`_Resolved since prior iteration (${resolved.length}):_`)
          for (const k of resolved) lines.push(`- ~~\`${k}\`~~`)
        }
      }
      lines.push('')
    }

    if (r.unused.length > 0) {
      lines.push(`### Unused references (${r.unused.length})`)
      lines.push('')
      for (const u of r.unused) {
        const title = u.title.length > 80 ? `${u.title.slice(0, 77)}…` : u.title
        lines.push(`- ${u.author} (${u.year}): ${title}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

async function loadPrior(
  num: number,
): Promise<Map<string, IterationResult> | null> {
  if (num <= 1) return null
  const dir = resolve(ITER_ROOT, `iter-${pad2(num - 1)}`)
  if (!existsSync(dir)) return null
  const files = await readdir(dir)
  const map = new Map<string, IterationResult>()
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const raw = await readFile(resolve(dir, f), 'utf8')
    const parsed = JSON.parse(raw) as IterationResult
    map.set(parsed.pdf, parsed)
  }
  return map.size > 0 ? map : null
}

async function main(): Promise<void> {
  const num = await nextIterNumber()
  const dir = resolve(ITER_ROOT, `iter-${pad2(num)}`)
  await mkdir(dir, { recursive: true })

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Running iteration ${pad2(num)}…`)
  const results = [
    await runPipeline(THESIS_PDF, 'thesis_example.pdf'),
    await runPipeline(JOURNAL_PDF, '14484.pdf'),
  ]

  await writeFile(
    resolve(dir, 'thesis.json'),
    JSON.stringify(results[0], null, 2),
  )
  await writeFile(
    resolve(dir, 'journal.json'),
    JSON.stringify(results[1], null, 2),
  )

  const prior = await loadPrior(num)
  const summary = renderSummary(results, prior)
  await writeFile(resolve(dir, 'summary.md'), summary)

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`\nSaved to ${dir}/`)
  for (const r of results) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(
      `  ${r.pdf}: match ${(r.stats.matchRate * 100).toFixed(1)}% — ` +
        `${r.stats.matchedUnique}/${r.stats.citationsUnique} matched, ` +
        `${r.stats.orphans} orphans, ${r.stats.unused} unused, ` +
        `${r.stats.references} refs`,
    )
  }
}

await main()
