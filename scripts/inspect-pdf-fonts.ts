#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const STANDARD_FONT_DATA_URL = new URL(
  '../node_modules/pdfjs-dist/standard_fonts/',
  import.meta.url,
).href

const main = async (): Promise<void> => {
  const path = resolve(process.argv[2])
  const buf = await readFile(path)
  const doc = await getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise

  const pageNum = Number(process.argv[3] ?? '2')
  const page = await doc.getPage(pageNum)
  await page.getOperatorList()
  const textContent = await page.getTextContent()
  const styles = textContent.styles as Record<string, { fontFamily?: string } | undefined>

  const seen = new Map<string, { count: number; sample: string; style?: { fontFamily?: string }; obj?: unknown }>()
  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const fontName = 'fontName' in item ? (item.fontName as string) : ''
    const entry = seen.get(fontName) ?? {
      count: 0,
      sample: item.str,
      style: styles[fontName],
    }
    entry.count += 1
    if (entry.sample.trim().length < item.str.trim().length) {
      entry.sample = item.str
    }
    if (!entry.obj) {
      try {
        entry.obj = page.commonObjs.get(fontName)
      } catch (err) {
        entry.obj = `ERR: ${(err as Error).message}`
      }
    }
    seen.set(fontName, entry)
  }

  for (const [name, info] of seen.entries()) {
    const obj = info.obj as {
      name?: string
      italic?: boolean
      bold?: boolean
      black?: boolean
      vertical?: boolean
      fallbackName?: string
      loadedName?: string
      cssFontInfo?: unknown
    } | undefined
    console.log(
      `${name}\tcount=${info.count}\tname=${obj?.name ?? '-'}\titalic=${obj?.italic ?? '-'}\tbold=${obj?.bold ?? '-'}\tfallback=${obj?.fallbackName ?? '-'}\tloaded=${obj?.loadedName ?? '-'}\tsample="${info.sample.slice(0, 50)}"`,
    )
  }

  await doc.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
