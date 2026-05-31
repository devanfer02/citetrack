/**
 * Diagnostic for the auto-apply engines (src/services/evaluation/apply).
 *
 * Builds a sample .docx with known EYD/KBBI errors, runs both the docx-patch
 * path and the page-rebuild path against synthetic findings, then writes the
 * outputs + change log to .claude/scripts/output/ and prints a summary. No DB
 * required — exercises the pure engines end to end.
 *
 * Run: bun .claude/scripts/test-apply.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import PizZip from 'pizzip'
import {
  emptyChangeLog,
  formatChangeLogText,
} from '#/services/evaluation/apply/change-log'
import { patchDocx } from '#/services/evaluation/apply/patch-docx'
import {
  buildDocxParagraphs,
  correctPages,
} from '#/services/evaluation/apply/rebuild-docx'
import type { Finding } from '#/services/evaluation/apply/types'

const OUTPUT_DIR = join(process.cwd(), '.claude', 'scripts', 'output')

function finding(over: Partial<Finding>): Finding {
  return {
    id: 1,
    evalJobId: 'diag',
    category: 'eyd',
    severity: 'warning',
    pageNumber: 1,
    offset: null,
    length: null,
    excerpt: null,
    token: null,
    message: 'diagnostic',
    suggestion: null,
    ruleId: 'eyd.diag',
    verificationSource: null,
    resolvedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

function textOf(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const paragraphText = 'Saya pergi kemana saja tanpa  arah yang jelas.'
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun(paragraphText)] })] }],
  })
  const originalDocx = await Packer.toBuffer(doc)

  const findings: Finding[] = [
    finding({ id: 1, token: 'kemana', suggestion: 'ke mana', excerpt: 'pergi kemana saja' }),
    finding({ id: 2, token: 'tanpa  arah', suggestion: 'tanpa arah', excerpt: 'saja tanpa arah yang' }),
    finding({ id: 3, token: 'tidakada', suggestion: 'tidak ada', excerpt: 'kata yang tidakada' }),
  ]

  // --- Patch path ---
  const patchLog = emptyChangeLog()
  const patched = patchDocx(originalDocx, findings, patchLog)
  const patchedText = textOf(new PizZip(patched).file('word/document.xml')!.asText())
  await writeFile(join(OUTPUT_DIR, 'apply-patched.docx'), patched)
  await writeFile(join(OUTPUT_DIR, 'apply-patch-changelog.txt'), formatChangeLogText(patchLog))

  console.log('=== Patch path (has-docx) ===')
  console.log('before:', paragraphText)
  console.log('after :', patchedText)
  console.log('applied:', patchLog.applied.length, 'unlocated:', patchLog.unlocated.length)
  for (const u of patchLog.unlocated) console.log('  unlocated:', u.token, '->', u.suggestion, `(${u.reason})`)

  // --- Rebuild path ---
  const rebuildLog = emptyChangeLog()
  const offset = paragraphText.indexOf('kemana')
  const corrected = correctPages(
    [{ pageNumber: 1, content: paragraphText }],
    [finding({ id: 1, offset, length: 'kemana'.length, token: 'kemana', suggestion: 'ke mana' })],
    rebuildLog,
  )
  const rebuiltDoc = new Document({
    sections: [{ children: buildDocxParagraphs(corrected) }],
  })
  const rebuilt = await Packer.toBuffer(rebuiltDoc)
  await writeFile(join(OUTPUT_DIR, 'apply-rebuilt.docx'), rebuilt)

  console.log('\n=== Rebuild path (PDF-only) ===')
  console.log('corrected page:', corrected[0]!.content)
  console.log('applied:', rebuildLog.applied.length)
  console.log('\nWrote outputs to', OUTPUT_DIR)
}

void main()
