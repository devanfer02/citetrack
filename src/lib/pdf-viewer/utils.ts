export function applyHighlight(
  container: HTMLElement,
  query: string,
  scrollTarget: HTMLElement | null,
): void {
  const existing = container.querySelectorAll('.citetrack-highlight')
  for (const el of existing) el.classList.remove('citetrack-highlight')

  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
  if (words.length === 0) return
  const anchor = [...words].toSorted((a, b) => b.length - a.length)[0]

  const spans = Array.from(
    container.querySelectorAll<HTMLElement>(':scope > span'),
  )
  let firstMatch: HTMLElement | null = null
  for (const span of spans) {
    const text = (span.textContent ?? '').toLowerCase()
    if (text.includes(anchor)) {
      span.classList.add('citetrack-highlight')
      if (!firstMatch) firstMatch = span
    }
  }

  if (firstMatch && scrollTarget) {
    const spanRect = firstMatch.getBoundingClientRect()
    const containerRect = scrollTarget.getBoundingClientRect()
    const delta = spanRect.top - containerRect.top - 80
    scrollTarget.scrollTop = Math.max(0, scrollTarget.scrollTop + delta)
  }
}

export function inferStatus(err: unknown): ViewerStatus {
  const e = err as PdfJsErrorShape
  if (e?.name === 'PasswordException') return 'password'
  if (e?.status === 404 || e?.name === 'MissingPDFException') return 'not-found'
  return 'error'
}
