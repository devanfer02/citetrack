#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'

const main = async (): Promise<void> => {
  const path = resolve(process.argv[2])
  const pageNum = Number(process.argv[3])
  const needle = process.argv[4]

  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  const page = pages.find((p) => p.pageNumber === pageNum)
  if (!page) {
    console.log('page not found')
    process.exit(1)
  }

  console.log(`content length: ${page.content.length}`)
  console.log(`italic ranges: ${page.italicRanges.length}, code ranges: ${page.codeRanges.length}`)

  if (needle) {
    let idx = 0
    const occurrences: number[] = []
    while ((idx = page.content.indexOf(needle, idx)) !== -1) {
      occurrences.push(idx)
      idx += needle.length
    }
    console.log(`\nOccurrences of "${needle}": ${occurrences.length}`)
    for (const offset of occurrences) {
      const ctx = page.content.slice(
        Math.max(0, offset - 40),
        offset + needle.length + 40,
      )
      const inItalic = page.italicRanges.some(
        ([s, e]) => offset >= s && offset < e,
      )
      const inCode = page.codeRanges.some(
        ([s, e]) => offset >= s && offset < e,
      )
      console.log(
        `o${offset} italic=${inItalic} code=${inCode} ctx="${ctx.replace(/\s+/g, ' ')}"`,
      )
    }
  }

  console.log('\nItalic ranges (first 20 with text):')
  for (const [s, e] of page.italicRanges.slice(0, 20)) {
    console.log(`[${s}, ${e}] "${page.content.slice(s, e)}"`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
