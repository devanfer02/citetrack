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
