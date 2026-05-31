import { createServerFn } from '@tanstack/react-start'
import { applyFixesSchema, parseFindingIds } from '#/schemas/evaluation'
import {
  ensureFormData,
  getOptionalDocxFile,
} from '#/services/pdf/upload-helpers'
import type { ApplyResult } from './runner'

export type { ApplyResult } from './runner'

// The handler body is stripped from the client bundle, so importing the
// server-only runner (db, fs, paths, docx engines) dynamically inside it keeps
// all of that out of the browser.
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
    const { applyFixes } = await import('./runner')
    return applyFixes(data.evalJobId, data.findingIds, docxBytes)
  })
