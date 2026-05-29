export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function filenameFromContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback
  const match = /filename="?([^"]+)"?/.exec(header)
  return match?.[1] ? decodeURIComponent(match[1]) : fallback
}

export async function downloadResponse(
  res: Response,
  fallbackName: string,
): Promise<void> {
  const blob = await res.blob()
  const filename = filenameFromContentDisposition(
    res.headers.get('Content-Disposition'),
    fallbackName,
  )
  downloadBlob(blob, filename)
}
