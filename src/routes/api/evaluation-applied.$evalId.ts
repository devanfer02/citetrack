import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationJobs } from '#/db/schema'
import { paths } from '#/lib/paths'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'tesis'
}

// Streams the corrected .docx (or the change-log .txt when ?file=log) produced
// by the most recent applyEvaluationFixes run for this job.
export const Route = createFileRoute('/api/evaluation-applied/$evalId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const wantLog = new URL(request.url).searchParams.get('file') === 'log'
        const filePath = wantLog
          ? paths.evaluationChangeLog(params.evalId)
          : paths.evaluationApplied(params.evalId)

        const { readFile } = await import('node:fs/promises')
        let buffer: Buffer
        try {
          buffer = await readFile(filePath)
        } catch {
          return new Response('Berkas perbaikan belum tersedia', { status: 404 })
        }

        const [job] = await db
          .select({ filename: evaluationJobs.filename })
          .from(evaluationJobs)
          .where(eq(evaluationJobs.id, params.evalId))
          .limit(1)
        const stem = baseName(job?.filename ?? 'tesis')
        const filename = wantLog
          ? `${stem}-perubahan.txt`
          : `${stem}-perbaikan.docx`

        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': wantLog ? 'text/plain; charset=utf-8' : DOCX_MIME,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            'Cache-Control': 'private, no-store',
          },
        })
      },
    },
  },
})
