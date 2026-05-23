import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import { paths } from '#/lib/paths'

export const Route = createFileRoute('/api/evaluation-pdf/$evalId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const filePath = paths.evaluationPdf(params.evalId)
        try {
          await stat(filePath)
        } catch {
          return new Response('PDF not found', { status: 404 })
        }

        const buffer = await readFile(filePath)
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, max-age=3600',
          },
        })
      },
    },
  },
})
