import { createFileRoute } from '@tanstack/react-router'
import { buildAnnotatedEvaluationPdf } from '#/services/evaluation/annotated-pdf'

export const Route = createFileRoute('/api/evaluation-annotated-pdf/$evalId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { buffer, filename } = await buildAnnotatedEvaluationPdf(
            params.evalId,
          )
          return new Response(buffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
              'Cache-Control': 'private, no-store',
            },
          })
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to build annotated PDF'
          return new Response(message, { status: 404 })
        }
      },
    },
  },
})
