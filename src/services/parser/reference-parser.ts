const HEADING_PATTERNS = [
  /daftar\s+pustaka/i,
  /referensi/i,
  /references?/i,
  /bibliography/i,
  /daftar\s+referensi/i,
  /kepustakaan/i,
]

const DOI_RE = /\b(?:doi:\s*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,)]+)/i
const URL_RE = /https?:\/\/[^\s,)]+/g

export function detectReferenceSection(
  pages: { pageNumber: number; content: string }[],
): ReferenceSection | null {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    for (const pattern of HEADING_PATTERNS) {
      if (pattern.test(page.content)) {
        const text = pages
          .slice(i)
          .map((p) => p.content)
          .join('\n\n')
        return { startPage: page.pageNumber, text }
      }
    }
  }
  return null
}

function splitReferenceEntries(text: string): string[] {
  // Remove the heading line itself
  let cleaned = text
  for (const pattern of HEADING_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  cleaned = cleaned.trim()

  // Strategy 1: Split on lines that start with an author name pattern
  // APA style: "Surname, F." or "Surname, F. M." at start of line
  const authorLineRe =
    /(?:^|\n\n?)(?=[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+,\s*[A-Z]\.)/g
  const parts = cleaned.split(authorLineRe).filter((s) => s.trim().length > 20)

  if (parts.length >= 2) return parts.map((p) => p.trim())

  // Strategy 2: Split on blank-line-separated blocks
  const blocks = cleaned.split(/\n\s*\n/).filter((s) => s.trim().length > 20)
  if (blocks.length >= 2) return blocks.map((b) => b.trim())

  // Strategy 3: Split on numbered entries [1], [2], etc.
  const numbered = cleaned
    .split(/\n?\[\d+\]\s*/)
    .filter((s) => s.trim().length > 10)
  if (numbered.length >= 2) return numbered.map((n) => n.trim())

  // Fallback: return the whole thing as one entry
  if (cleaned.trim().length > 20) return [cleaned.trim()]
  return []
}

function extractDoi(text: string): string | null {
  const match = text.match(DOI_RE)
  return match ? match[1] : null
}

function extractUrl(text: string): string | null {
  const matches = text.match(URL_RE)
  if (!matches) return null
  // Prefer non-doi URL
  const nonDoi = matches.find((u) => !u.includes('doi.org'))
  return nonDoi ?? matches[0]
}

function extractYear(text: string): string {
  // APA: Author (Year). or Author (Year, Month).
  const parenYear = text.match(/\((\d{4})[a-z]?[,)]/)
  if (parenYear) return parenYear[1]

  // Fallback: first 4-digit year in a reasonable range
  const anyYear = text.match(/\b(19\d{2}|20[0-2]\d)\b/)
  return anyYear ? anyYear[1] : 'n.d.'
}

function extractAuthorAndRest(
  text: string,
): { author: string; rest: string } | null {
  // APA: "Surname, F. M., Surname, F., & Surname, F. (Year)."
  // Match everything before the (Year) as author block
  const apaMatch = text.match(
    /^(.+?)\s*\((\d{4})[a-z]?(?:,\s*\w+)?\)\.\s*(.*)$/s,
  )
  if (apaMatch) {
    return {
      author: apaMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: apaMatch[3],
    }
  }

  // Fallback: take everything before first year mention
  const yearPos = text.search(/\(?\d{4}\)?/)
  if (yearPos > 3) {
    return {
      author: text
        .slice(0, yearPos)
        .replace(/[.,\s]+$/, '')
        .trim(),
      rest: text.slice(yearPos).replace(/^\(?\d{4}\)?[.,\s]*/, ''),
    }
  }

  return null
}

function extractTitle(rest: string): string {
  // APA: Title is the first sentence after year, often in italics
  // In plain text: everything up to the first period followed by a space + uppercase
  const titleMatch = rest.match(/^(.+?)\.\s+(?=[A-Z]|$)/s)
  if (titleMatch) return titleMatch[1].trim()
  // Fallback: take first 200 chars
  return rest.slice(0, 200).replace(/\.\s*$/, '').trim()
}

function extractPublisherJournal(
  rest: string,
  title: string,
): { publisher: string | null; journal: string | null } {
  const afterTitle = rest.slice(rest.indexOf(title) + title.length).trim()
  const cleaned = afterTitle
    .replace(/^\.\s*/, '')
    .replace(DOI_RE, '')
    .replace(URL_RE, '')
    .trim()

  if (!cleaned || cleaned.length < 3) return { publisher: null, journal: null }

  // If contains volume/issue indicators, it's a journal
  if (/\d+\(\d+\)/.test(cleaned) || /,\s*\d+\s*[,(]/.test(cleaned)) {
    return { publisher: null, journal: cleaned.replace(/\.\s*$/, '') }
  }

  // If contains ": " it's likely "City: Publisher"
  if (cleaned.includes(': ')) {
    return { publisher: cleaned.replace(/\.\s*$/, ''), journal: null }
  }

  return { publisher: cleaned.replace(/\.\s*$/, ''), journal: null }
}

export function parseReferenceEntry(rawText: string): ParsedReference {
  const year = extractYear(rawText)
  const doi = extractDoi(rawText)
  const url = extractUrl(rawText)

  const parsed = extractAuthorAndRest(rawText)
  if (!parsed) {
    return {
      author: 'Unknown',
      year,
      title: rawText.slice(0, 200),
      doi,
      url,
      publisher: null,
      journal: null,
      rawText,
      startPage: null,
    }
  }

  const title = extractTitle(parsed.rest)
  const { publisher, journal } = extractPublisherJournal(parsed.rest, title)

  return {
    author: parsed.author,
    year,
    title,
    doi,
    url,
    publisher,
    journal,
    rawText,
    startPage: null,
  }
}

export function parseReferences(
  pages: { pageNumber: number; content: string }[],
): ParsedReference[] {
  const section = detectReferenceSection(pages)
  if (!section) return []

  const entries = splitReferenceEntries(section.text)
  return entries.map((raw) => ({
    ...parseReferenceEntry(raw),
    startPage: section.startPage,
  }))
}
