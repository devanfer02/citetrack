#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeKbbi } from '#/services/evaluation/kbbi/analyzer'
import { isKnownWord } from '#/services/evaluation/kbbi/lookup'

const main = async (): Promise<void> => {
  const target = process.argv[2] ?? 'pembalajaran'
  console.log(`\nLookup: ${target}`)
  const result = await isKnownWord(target)
  console.log('isKnownWord:', result)

  const buf = await readFile(
    resolve(process.cwd(), '.claude/pdf_examples/thesis_example.pdf'),
  )
  const { pages } = await extractPdfText(new Uint8Array(buf))
  const page11 = pages.find((p) => p.pageNumber === 11)
  if (!page11) return
  const needle = target
  const idx = page11.content.indexOf(needle)
  console.log(`\nPage 11 "${needle}" at offset ${idx}`)
  if (idx >= 0) {
    console.log('context:', JSON.stringify(page11.content.slice(Math.max(0, idx - 40), idx + 40)))
  }
  console.log('codeRanges:', page11.codeRanges)
  console.log('italicRanges (sample 5):', page11.italicRanges.slice(0, 5))

  const findings = await analyzeKbbi([page11])
  const hit = findings.find((f) => f.token.toLowerCase() === target.toLowerCase())
  console.log('\nAnalyzer hit:', hit ?? 'NOT FOUND')
  console.log('Total findings on page 11:', findings.length)
  console.log('First 10 tokens:', findings.slice(0, 10).map((f) => f.token))

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
