import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { refreshVocabularyCache } from '#/services/evaluation/vocabulary-cache'

const PDF_DIR = resolve(process.cwd(), '.claude/pdf_examples')
const OUT_DIR = resolve(process.cwd(), '.claude/scripts/output')

type Hit = {
  pdf: string
  page: number
  token: string
  line: string
  offset: number
}

const lineAround = (content: string, offset: number): string => {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1
  const nlIdx = content.indexOf('\n', offset)
  const lineEnd = nlIdx === -1 ? content.length : nlIdx
  return content.slice(lineStart, lineEnd).trim()
}

const loadPdf = async (path: string): Promise<AnalyzedPage[]> => {
  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    content: p.content,
    codeRanges: p.codeRanges,
    italicRanges: p.italicRanges,
  }))
}

const run = async (): Promise<void> => {
  await refreshVocabularyCache()
  await mkdir(OUT_DIR, { recursive: true })

  const files = (await readdir(PDF_DIR))
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => resolve(PDF_DIR, f))

  const allHits: Hit[] = []
  const perPdfMd: string[] = []

  for (const file of files) {
    const name = basename(file)
    console.log(`\n=== ${name} ===`)
    const pages = await loadPdf(file)
    const findings = await analyzeEyd(pages)
    const acronymFindings = findings.filter(
      (f) => f.ruleId === 'eyd.acronym-undeclared',
    )

    perPdfMd.push(`## ${name}\n`)
    perPdfMd.push(`Total acronym findings: **${acronymFindings.length}**\n`)
    perPdfMd.push(`| Page | Token | Line context |`)
    perPdfMd.push(`|---|---|---|`)

    for (const f of acronymFindings) {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      if (!page) continue
      const token = page.content.slice(f.offset, f.offset + f.length)
      const line = lineAround(page.content, f.offset)
      const cleanLine = line.replace(/\|/g, '\\|').slice(0, 200)
      allHits.push({
        pdf: name,
        page: f.pageNumber,
        token,
        line,
        offset: f.offset,
      })
      perPdfMd.push(`| ${f.pageNumber} | \`${token}\` | ${cleanLine} |`)
      console.log(`p.${f.pageNumber}  ${token.padEnd(8)}  ${line.slice(0, 100)}`)
    }
    perPdfMd.push('')
  }

  await writeFile(
    resolve(OUT_DIR, 'acronym-findings.json'),
    JSON.stringify(allHits, null, 2),
    'utf8',
  )
  await writeFile(
    resolve(OUT_DIR, 'acronym-findings.md'),
    `# eyd.acronym-undeclared — PDF diagnostic\n\nGenerated: ${new Date().toISOString()}\n\n${perPdfMd.join('\n')}`,
    'utf8',
  )
  console.log(`\nWrote ${allHits.length} hits to ${OUT_DIR}/acronym-findings.{json,md}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
