import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isLocalEnv } from '#/env'

const FIXTURE_PATH = join(process.cwd(), '.claude', 'pdf_examples', 'thesis_example.pdf')

export const Route = createFileRoute('/api/dev-fixture')({
  server: {
    handlers: {
      GET: async () => {
        if (!isLocalEnv) {
          return new Response('Not found', { status: 404 })
        }
        try {
          await stat(FIXTURE_PATH)
        } catch {
          return new Response(
            'Dev fixture not found at .claude/pdf_examples/thesis_example.pdf',
            { status: 404 },
          )
        }
        const buffer = await readFile(FIXTURE_PATH)
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="thesis_example.pdf"',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
