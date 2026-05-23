#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { analyzeKbbi } from '#/services/evaluation/kbbi/analyzer'

const main = async (): Promise<void> => {
  const path = resolve(process.argv[2])
  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))

  const mode = process.argv[3] ?? 'eyd'

  if (mode === 'eyd' || mode === 'all') {
    const eyd = await analyzeEyd(pages)
    console.log(`\n=== EYD findings: ${eyd.length} ===`)
    const byRule = new Map<string, number>()
    for (const f of eyd) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1)
    for (const [rule, count] of byRule) console.log(`${rule}: ${count}`)
    console.log('\nFirst 30 foreign-not-italic:')
    let shown = 0
    for (const f of eyd) {
      if (f.ruleId !== 'eyd.foreign-not-italic') continue
      if (shown >= 30) break
      shown++
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      const excerpt = page
        ? page.content
            .slice(Math.max(0, f.offset - 20), f.offset + f.length + 20)
            .replace(/\s+/g, ' ')
        : ''
      console.log(`p${f.pageNumber} o${f.offset}: ${f.message} | ctx="${excerpt}"`)
    }
  }

  if (mode === 'kbbi' || mode === 'all') {
    const kbbi = await analyzeKbbi(pages)
    console.log(`\n=== KBBI findings: ${kbbi.length} ===`)
    console.log('First 30:')
    for (const f of kbbi.slice(0, 30)) {
      console.log(`p${f.pageNumber} o${f.offset}: "${f.token}"`)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
