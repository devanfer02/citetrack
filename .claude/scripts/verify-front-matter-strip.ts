#!/usr/bin/env bun
// Pull page-1 content for the FP PDFs and exercise stripFrontMatter on each.

import { execSync } from 'node:child_process'
import {
  looksLikeFrontMatter,
  stripFrontMatter,
} from '#/services/matcher/passage-matcher'

const PDF_IDS = [107, 93]

for (const id of PDF_IDS) {
  const sql = `SELECT page_number, content FROM source_pages WHERE source_pdf_id=${id} ORDER BY page_number;`
  const raw = execSync(
    `docker compose exec -T db psql -U postgres -d citetrack -tA -F $'\\t' -c "${sql}"`,
    { encoding: 'utf8' },
  )
  const pages = raw
    .trim()
    .split('\n')
    .map((line) => {
      const tab = line.indexOf('\t')
      return { page: Number(line.slice(0, tab)), text: line.slice(tab + 1) }
    })

  console.log(`\n=== PDF ${id} (${pages.length} pages) ===`)
  for (const { page, text } of pages) {
    const flagged = looksLikeFrontMatter(text)
    const cleaned = stripFrontMatter(text)
    const verdict = flagged
      ? cleaned === ''
        ? 'DROPPED'
        : `STRIPPED ${text.length}→${cleaned.length}`
      : 'KEPT'
    console.log(
      `  p.${page}: ${verdict.padEnd(20)} preview="${(cleaned || text).slice(0, 80).replace(/\s+/g, ' ')}…"`,
    )
  }
}
