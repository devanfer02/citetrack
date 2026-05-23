import { join } from 'node:path'

const UPLOADS_ROOT = join(process.cwd(), 'uploads')

export const paths = {
  userUploads: join(UPLOADS_ROOT, 'users'),
  sourceUploads: join(UPLOADS_ROOT, 'sources'),

  userPdf: (jobId: string) => join(UPLOADS_ROOT, 'users', `${jobId}.pdf`),
  userPdfOriginal: (jobId: string) =>
    join(UPLOADS_ROOT, 'users', `${jobId}_original.pdf`),
  userPdfPreview: (jobId: string) =>
    join(UPLOADS_ROOT, 'users', `${jobId}_preview.pdf`),

  sourcePdf: (sourcePdfId: number) =>
    join(UPLOADS_ROOT, 'sources', `${sourcePdfId}.pdf`),
} as const
