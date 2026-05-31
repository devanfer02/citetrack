import { and, eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { evaluationFindings } from '#/db/schema'
import { paths } from '#/lib/paths'
import { applyFixesSchema, parseFindingIds } from '#/schemas/evaluation'
import {
  ensureFormData,
  getOptionalDocxFile,
} from '#/services/pdf/upload-helpers'
import { emptyChangeLog, summarizeChangeLog } from './change-log'
import { isEligible } from './eligibility'
import { patchDocx } from './patch-docx'
import { rebuildCorrectedDocx } from './rebuild-docx'
import type { ApplyMode, ChangeLog, Finding } from './types'

export type ApplyResult = {
  mode: ApplyMode
  summary: { appliedCount: number; unlocatedCount: number }
  changeLog: ChangeLog
}

async function loadSelectedFindings(
  evalJobId: string,
  findingIds: readonly number[],
): Promise<Finding[]> {
  const rows = await db
    .select()
    .from(evaluationFindings)
    .where(
      and(
        eq(evaluationFindings.evalJobId, evalJobId),
        inArray(evaluationFindings.id, [...findingIds]),
      ),
    )
  return rows.filter(isEligible)
}

async function persistOutput(
  evalJobId: string,
  docx: Buffer,
  log: ChangeLog,
): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { formatChangeLogText } = await import('./change-log')
  await mkdir(paths.evaluationUploads, { recursive: true })
  await writeFile(paths.evaluationApplied(evalJobId), docx)
  await writeFile(paths.evaluationChangeLog(evalJobId), formatChangeLogText(log))
}

// Marks exactly the findings that were applied as resolved, so a second apply
// run skips them and the results table reflects the fixes.
async function markApplied(log: ChangeLog): Promise<void> {
  const ids = log.applied.map((e) => e.findingId)
  if (ids.length === 0) return
  await db
    .update(evaluationFindings)
    .set({ resolvedAt: new Date() })
    .where(inArray(evaluationFindings.id, ids))
}

export async function applyFixes(
  evalJobId: string,
  findingIds: readonly number[],
  docxBytes: Buffer | null,
): Promise<ApplyResult> {
  const selected = await loadSelectedFindings(evalJobId, findingIds)
  const log = emptyChangeLog()

  const docx = docxBytes
    ? patchDocx(docxBytes, selected, log)
    : await rebuildCorrectedDocx(evalJobId, selected, log)
  const mode: ApplyMode = docxBytes ? 'patch' : 'rebuild'

  await persistOutput(evalJobId, docx, log)
  await markApplied(log)

  return { mode, summary: summarizeChangeLog(log), changeLog: log }
}

export const applyEvaluationFixes = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const fd = ensureFormData(data)
    const input = applyFixesSchema.parse({
      evalJobId: fd.get('evalJobId'),
      findingIds: parseFindingIds(fd.get('findingIds')),
    })
    return { ...input, docxFile: getOptionalDocxFile(fd) }
  })
  .handler(async ({ data }): Promise<ApplyResult> => {
    const docxBytes = data.docxFile
      ? Buffer.from(await data.docxFile.arrayBuffer())
      : null
    return applyFixes(data.evalJobId, data.findingIds, docxBytes)
  })
