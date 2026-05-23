import { MAX_FILE_SIZE } from '#/lib/upload/constants'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateFile(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Only PDF files are accepted'
  if (file.size > MAX_FILE_SIZE) return 'File size exceeds 50MB limit'
  return null
}
