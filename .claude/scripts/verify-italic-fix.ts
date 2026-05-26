#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'

const main = async (): Promise<void> => {
  const path = resolve(process.argv[2])
  const targetPage = Number(process.argv[3] ?? '17')
  const needle = (process.argv[4] ?? 'game').toLowerCase()

  const buf = await readFile(path)
  const result = await extractPdfText(new Uint8Array(buf))
  const page = result.pages.find((p) => p.pageNumber === targetPage)
  if (!page) {
    console.error(`page ${targetPage} not found`)
    process.exit(1)
  }

  console.log(`\nPage ${targetPage} content length: ${page.content.length}`)
  console.log(`Italic ranges: ${page.italicRanges.length}`)

  const re = new RegExp(needle, 'gi')
  let m: RegExpExecArray | null
  let total = 0
  let italicCount = 0
  while ((m = re.exec(page.content)) !== null) {
    total++
    const offset = m.index
    const inItalic = page.italicRanges.some(
      ([s, e]) => offset >= s && offset + m![0].length <= e,
    )
    if (inItalic) italicCount++
    const ctxStart = Math.max(0, offset - 40)
    const ctxEnd = Math.min(page.content.length, offset + m[0].length + 40)
    const before = page.content.slice(ctxStart, offset)
    const hit = page.content.slice(offset, offset + m[0].length)
    const after = page.content.slice(offset + m[0].length, ctxEnd)
    console.log(`\n[#${total}] offset=${offset} italic=${inItalic}`)
    console.log(`  ...${before}>${hit}<${after}...`)
  }
  console.log(`\nTotal "${needle}" hits: ${total}, italic: ${italicCount}, non-italic: ${total - italicCount}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
