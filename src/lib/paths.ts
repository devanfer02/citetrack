import { join } from 'node:path'

const UPLOADS_ROOT = join(process.cwd(), 'uploads')

export const paths = {
  userUploads: join(UPLOADS_ROOT, 'users'),
  sourceUploads: join(UPLOADS_ROOT, 'sources'),
  evaluationUploads: join(UPLOADS_ROOT, 'evaluations'),

  userPdf: (jobId: string) => join(UPLOADS_ROOT, 'users', `${jobId}.pdf`),
  userPdfOriginal: (jobId: string) =>
    join(UPLOADS_ROOT, 'users', `${jobId}_original.pdf`),
  userPdfPreview: (jobId: string) =>
    join(UPLOADS_ROOT, 'users', `${jobId}_preview.pdf`),

  sourcePdf: (sourcePdfId: number) =>
    join(UPLOADS_ROOT, 'sources', `${sourcePdfId}.pdf`),

  evaluationPdf: (evalJobId: string) =>
    join(UPLOADS_ROOT, 'evaluations', `${evalJobId}.pdf`),

  // Auto-apply output: the corrected/patched .docx and its plain-text change
  // log, written after the student applies a selection of findings.
  evaluationApplied: (evalJobId: string) =>
    join(UPLOADS_ROOT, 'evaluations', `${evalJobId}_applied.docx`),
  evaluationChangeLog: (evalJobId: string) =>
    join(UPLOADS_ROOT, 'evaluations', `${evalJobId}_changelog.txt`),
} as const
