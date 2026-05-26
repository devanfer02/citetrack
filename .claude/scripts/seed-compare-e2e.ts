#!/usr/bin/env bun
// Seeds two finished evaluations — one per thesis example PDF — so the
// evaluation-comparison feature can be exercised end-to-end in the browser.
//
// Idempotent: if a `done` evaluation already exists for a given filename it is
// reused (analysis is expensive), unless FRESH=1 forces a fresh run.
//
//   bun .claude/scripts/seed-compare-e2e.ts          # reuse where possible
//   FRESH=1 bun .claude/scripts/seed-compare-e2e.ts  # always re-process both
//
// Prints the two eval IDs plus ready-to-open /history and /compare URLs.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import {
  evaluationJobs,
  evaluationPages,
  evaluationSummary,
} from '#/db/schema'
import { paths } from '#/lib/paths'
import { extractPdfText } from '#/services/pdf/extractor'
import { runEvaluationAnalysis } from '#/services/evaluation/orchestrator'

const PDF_DIR = resolve(process.cwd(), '.claude/pdf_examples')
const TARGETS = [
  { filename: 'thesis_example.pdf' },
  { filename: 'thesis_example_2.pdf' },
] as const

const FRESH = process.env.FRESH === '1'

async function ensurePdfOnDisk(evalJobId: string, pdfAbsPath: string) {
  const dest = paths.evaluationPdf(evalJobId)
  if (existsSync(dest)) return
  await mkdir(paths.evaluationUploads, { recursive: true })
  await copyFile(pdfAbsPath, dest)
  console.log(`  copied PDF to ${dest}`)
}

async function findReusable(filename: string): Promise<string | null> {
  if (FRESH) return null
  const rows = await db
    .select({ id: evaluationJobs.id })
    .from(evaluationJobs)
    .innerJoin(
      evaluationSummary,
      eq(evaluationSummary.evalJobId, evaluationJobs.id),
    )
    .where(
      and(
        eq(evaluationJobs.filename, filename),
        eq(evaluationJobs.status, 'done'),
      ),
    )
    .orderBy(desc(evaluationJobs.createdAt))
    .limit(1)
  return rows[0]?.id ?? null
}

async function createEval(filename: string): Promise<string> {
  const pdfAbsPath = resolve(PDF_DIR, filename)
  if (!existsSync(pdfAbsPath)) {
    throw new Error(`PDF not found: ${pdfAbsPath}`)
  }
  const buffer = await readFile(pdfAbsPath)

  const [job] = await db
    .insert(evaluationJobs)
    .values({ filename, fileSize: buffer.length, status: 'pending' })
    .returning()

  await mkdir(paths.evaluationUploads, { recursive: true })
  await writeFile(paths.evaluationPdf(job.id), buffer)

  await db
    .update(evaluationJobs)
    .set({ status: 'extracting' })
    .where(eq(evaluationJobs.id, job.id))

  console.log(`  extracting ${filename} ...`)
  const result = await extractPdfText(new Uint8Array(buffer))

  if (result.pages.length > 0) {
    await db.insert(evaluationPages).values(
      result.pages.map((page) => ({
        evalJobId: job.id,
        pageNumber: page.pageNumber,
        content: page.content,
        charCount: page.charCount,
        lowTextDensity: page.lowTextDensity ? 1 : 0,
        codeRanges: page.codeRanges,
        italicRanges: page.italicRanges,
      })),
    )
  }

  await db
    .update(evaluationJobs)
    .set({
      totalPages: result.totalPages,
      extractedPages: result.pages.length,
    })
    .where(eq(evaluationJobs.id, job.id))

  console.log(
    `  analyzing ${filename} (${result.totalPages} pages) — this can take a while ...`,
  )
  await runEvaluationAnalysis(job.id)
  return job.id
}

async function ensureEval(filename: string): Promise<{
  id: string
  reused: boolean
}> {
  const reusable = await findReusable(filename)
  if (reusable) {
    await ensurePdfOnDisk(reusable, resolve(PDF_DIR, filename))
    return { id: reusable, reused: true }
  }
  const id = await createEval(filename)
  return { id, reused: false }
}

async function main() {
  console.log(`seed-compare-e2e (FRESH=${FRESH})`)
  const results: Array<{ filename: string; id: string; reused: boolean }> = []
  for (const t of TARGETS) {
    console.log(`\n• ${t.filename}`)
    const r = await ensureEval(t.filename)
    console.log(`  ${r.reused ? 'reused' : 'created'} eval ${r.id}`)
    results.push({ filename: t.filename, ...r })
  }

  const [a, b] = results
  console.log('\n=== READY FOR E2E ===')
  for (const r of results) console.log(`${r.filename}  ->  ${r.id}`)
  console.log(`\nhistory:  http://localhost:3000/history?kind=evaluation`)
  console.log(
    `compare:  http://localhost:3000/evaluation/compare/${a!.id}/${b!.id}`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
