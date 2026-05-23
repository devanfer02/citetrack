import { readFile } from 'node:fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { paths } from '#/lib/paths'

const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g
const ITALIC_FONT_RE = /italic|oblique/i

export async function extractItalicWordsPerPage(
  evalJobId: string,
): Promise<Map<number, Set<string>>> {
  const file = await readFile(paths.evaluationPdf(evalJobId))
  const doc = await getDocument({ data: new Uint8Array(file) }).promise
  const result = new Map<number, Set<string>>()

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const textContent = await page.getTextContent()
      const italicWords = new Set<string>()

      for (const item of textContent.items) {
        if (!('str' in item)) continue
        const fontName = 'fontName' in item ? item.fontName : ''
        if (typeof fontName !== 'string' || !ITALIC_FONT_RE.test(fontName)) {
          continue
        }
        for (const match of item.str.matchAll(TOKEN_RE)) {
          italicWords.add(match[0].toLowerCase())
        }
      }

      result.set(pageNum, italicWords)
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return result
}
