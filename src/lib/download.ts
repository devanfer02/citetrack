export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Defer revocation: some browsers (iOS Safari, older Firefox/Chrome) cancel
  // the download if the object URL is revoked before they resolve it.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function filenameFromContentDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback
  const match = /filename=(?:"([^"]+)"|([^;\s]+))/.exec(header)
  const filename = match ? (match[1] ?? match[2]) : undefined
  if (!filename) return fallback
  try {
    return decodeURIComponent(filename)
  } catch {
    return filename
  }
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
