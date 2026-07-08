#!/usr/bin/env bun
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { analyzeKbbi } from '#/services/evaluation/kbbi/analyzer'

const THESIS_PDF = resolve(process.cwd(), '.claude/pdf_examples/thesis_example.pdf')
const JOURNAL_PDF = resolve(process.cwd(), '.claude/pdf_examples/14484.pdf')
const ITER_ROOT = resolve(process.cwd(), 'docs/train/iterations')

const nextIterNumber = async (): Promise<number> => {
  try {
    const entries = await readdir(ITER_ROOT)
    const nums = entries
      .map((n) => /^iter-(\d+)$/.exec(n)?.[1])
      .filter((x): x is string => x !== undefined)
      .map(Number)
    return (nums.length ? Math.max(...nums) : 0) + 1
  } catch {
    return 1
  }
}

const summarize = <T extends { pageNumber: number; ruleId?: string; token?: string }>(
  label: string,
  findings: T[],
): string => {
  const byRule = new Map<string, number>()
  for (const f of findings) {
    const key = f.ruleId ?? 'kbbi.unknown-word'
    byRule.set(key, (byRule.get(key) ?? 0) + 1)
  }
  const lines: string[] = [`${label}: ${findings.length} total`]
  for (const [rule, count] of [...byRule.entries()].toSorted((a, b) => b[1] - a[1])) {
    lines.push(`  ${rule}: ${count}`)
  }
  return lines.join('\n')
}

const run = async (pdfPath: string, label: string, dir: string): Promise<string> => {
  const buf = await readFile(pdfPath)
  const { pages } = await extractPdfText(new Uint8Array(buf))

  const analyzed: AnalyzedPage[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    content: p.content,
    codeRanges: p.codeRanges,
    italicRanges: p.italicRanges,
  }))

  const [eyd, kbbiAnalysis] = await Promise.all([
    analyzeEyd(analyzed),
    analyzeKbbi(analyzed),
  ])
  const kbbi = kbbiAnalysis.findings

  const pagesMeta = pages.map((p) => ({
    pageNumber: p.pageNumber,
    contentLength: p.content.length,
    codeRangesCount: p.codeRanges.length,
    italicRangesCount: p.italicRanges.length,
  }))

  await writeFile(
    resolve(dir, `${label}-eyd.json`),
    JSON.stringify(eyd, null, 2),
  )
  await writeFile(
    resolve(dir, `${label}-kbbi.json`),
    JSON.stringify(
      kbbi.map((f) => ({
        pageNumber: f.pageNumber,
        offset: f.offset,
        token: f.token,
        suggestion: f.suggestion,
        ruleId: f.ruleId,
      })),
      null,
      2,
    ),
  )
  await writeFile(
    resolve(dir, `${label}-pages.json`),
    JSON.stringify(pagesMeta, null, 2),
  )

  return [
    `\n=== ${label} (${pdfPath}) ===`,
    `pages: ${pages.length}`,
    `total code ranges: ${pages.reduce((s, p) => s + p.codeRanges.length, 0)}`,
    `total italic ranges: ${pages.reduce((s, p) => s + p.italicRanges.length, 0)}`,
    summarize('EYD', eyd),
    summarize('KBBI', kbbi),
  ].join('\n')
}

const main = async (): Promise<void> => {
  const n = await nextIterNumber()
  const dir = resolve(ITER_ROOT, `iter-${String(n).padStart(2, '0')}`)
  await mkdir(dir, { recursive: true })
  console.log(`iteration: ${dir}`)

  const parts: string[] = []
  parts.push(`iteration: ${n}`)
  parts.push(`timestamp: ${new Date().toISOString()}`)
  parts.push(await run(THESIS_PDF, 'thesis', dir))
  parts.push(await run(JOURNAL_PDF, 'journal', dir))

  const summary = parts.join('\n')
  await writeFile(resolve(dir, 'summary.txt'), summary + '\n')
  console.log(summary)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
