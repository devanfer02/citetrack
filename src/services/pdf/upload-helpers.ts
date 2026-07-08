import { getConfig } from '#/services/configurations-cache'

export function ensureFormData(data: unknown): FormData {
  if (!(data instanceof FormData)) {
    throw new Error('Expected FormData')
  }
  return data
}

export function getPdfFile(data: FormData, field = 'file'): File {
  const file = data.get(field)
  if (!(file instanceof File)) {
    throw new Error('No file provided')
  }
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are accepted')
  }
  return file
}

export function getPdfFiles(data: FormData, field = 'files'): File[] {
  const files = data.getAll(field).filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    throw new Error('At least one PDF is required')
  }
  for (const f of files) {
    if (f.type !== 'application/pdf') {
      throw new Error(`"${f.name}" is not a PDF`)
    }
  }
  return files
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// The student's original .docx is optional on the apply request. Returns null
// when no file was attached, and throws only when a non-docx file was sent.
export function getOptionalDocxFile(data: FormData, field = 'docx'): File | null {
  const file = data.get(field)
  if (!(file instanceof File) || file.size === 0) return null
  if (file.type !== DOCX_MIME && !file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('Hanya berkas .docx yang diterima')
  }
  return file
}

function formatSizeLimitError(filename: string, maxBytes: number): string {
  return `"${filename}" exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB size limit`
}

export async function assertWithinUploadLimit(file: File): Promise<void> {
  const maxFileSize = await getConfig('upload.max_file_size_bytes')
  if (file.size > maxFileSize) {
    throw new Error(formatSizeLimitError(file.name, maxFileSize))
  }
}

export async function assertAllWithinUploadLimit(files: readonly File[]): Promise<void> {
  const maxFileSize = await getConfig('upload.max_file_size_bytes')
  for (const f of files) {
    if (f.size > maxFileSize) {
      throw new Error(formatSizeLimitError(f.name, maxFileSize))
    }
  }
}
