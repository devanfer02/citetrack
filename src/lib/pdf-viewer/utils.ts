interface SpanIndex {
  el: HTMLElement
  start: number
  end: number
}

const SEPARATOR = ' '

function collectSpanIndex(container: HTMLElement): {
  spans: SpanIndex[]
  concatenated: string
} {
  const spans: SpanIndex[] = []
  let cursor = 0
  let concatenated = ''
  for (const el of container.querySelectorAll<HTMLElement>('span')) {
    const text = el.textContent ?? ''
    if (!text.trim().length) continue
    const lower = text.toLowerCase()
    spans.push({ el, start: cursor, end: cursor + lower.length })
    concatenated += lower + SEPARATOR
    cursor += lower.length + SEPARATOR.length
  }
  return { spans, concatenated }
}

function findTarget(
  concatenated: string,
  rawQuery: string,
): { start: number; end: number } | null {
  const normalized = rawQuery.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const direct = concatenated.indexOf(normalized)
  if (direct >= 0) return { start: direct, end: direct + normalized.length }

  const words = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .toSorted((a, b) => b.length - a.length)

  for (const word of words) {
    const idx = concatenated.indexOf(word)
    if (idx >= 0) return { start: idx, end: idx + word.length }
  }
  return null
}

export function applyHighlight(
  container: HTMLElement,
  query: string,
  scrollTarget: HTMLElement | null,
): void {
  for (const el of container.querySelectorAll('.citetrack-highlight')) {
    el.classList.remove('citetrack-highlight')
  }

  if (!query.trim()) return

  const { spans, concatenated } = collectSpanIndex(container)
  if (!spans.length) return

  const match = findTarget(concatenated, query)
  if (!match) return

  let firstMatch: HTMLElement | null = null
  for (const span of spans) {
    if (span.end <= match.start || span.start >= match.end) continue
    span.el.classList.add('citetrack-highlight')
    if (!firstMatch) firstMatch = span.el
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
