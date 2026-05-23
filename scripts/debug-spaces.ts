#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'

const main = async (): Promise<void> => {
  const path = resolve(process.argv[2])
  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  const findings = await analyzeEyd(pages)
  const spaceFindings = findings.filter((f) => f.ruleId === 'eyd.space-before-punct')
  console.log(`space-before-punct: ${spaceFindings.length}`)
  for (const f of spaceFindings.slice(0, 40)) {
    const page = pages.find((p) => p.pageNumber === f.pageNumber)
    const ctx = page
      ? page.content
          .slice(Math.max(0, f.offset - 15), f.offset + f.length + 15)
          .replace(/\n/g, '\\n')
      : ''
    console.log(`p${f.pageNumber} o${f.offset}: "${ctx}"`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
