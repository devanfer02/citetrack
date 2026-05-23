import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const Route = createFileRoute('/api/pdf/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const uploadsDir = join(process.cwd(), 'uploads')
        const previewPath = join(uploadsDir, `${params.jobId}_preview.pdf`)
        const originalPath = join(uploadsDir, `${params.jobId}.pdf`)

        let filePath = originalPath
        try {
          await stat(previewPath)
          filePath = previewPath
        } catch {
          try {
            await stat(originalPath)
          } catch {
            return new Response('PDF not found', { status: 404 })
          }
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
