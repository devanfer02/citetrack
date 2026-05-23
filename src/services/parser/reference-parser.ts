const HEADING_PATTERNS = [
  /daftar\s+pustaka/i,
  /referensi/i,
  /references?/i,
  /bibliography/i,
  /daftar\s+referensi/i,
  /kepustakaan/i,
]

const DOI_RE = /\b(?:doi:\s*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,)]+[^\s,).:])/i
const URL_RE = /https?:\/\/[^\s,)>\]]+/g

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
  let cleaned = text
  for (const pattern of HEADING_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  cleaned = cleaned.trim()

  // Strategy 1: Indonesian style — "Author. Year." or "Author, F. Year."
  // Matches lines starting with a name followed by a dot/comma then a 4-digit year
  const idnStyleRe =
    /(?:^|\n\n?)(?=[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+(?:[.,]\s*(?:[A-Z]\.?\s*)*)?(?:\s+(?:dan|and|&)\s+[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+(?:[.,]\s*(?:[A-Z]\.?\s*)*)?)?\s*[.,]?\s*(?:\(?\d{4}\)?))/g
  const idnParts = cleaned.split(idnStyleRe).filter((s) => s.trim().length > 20)
  if (idnParts.length >= 2) return idnParts.map((p) => p.trim())

  // Strategy 2: APA style — "Surname, F." or "Surname, F. M." at start of line
  const authorLineRe =
    /(?:^|\n\n?)(?=[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+,\s*[A-Z]\.)/g
  const apaParts = cleaned.split(authorLineRe).filter((s) => s.trim().length > 20)
  if (apaParts.length >= 2) return apaParts.map((p) => p.trim())

  // Strategy 3: Blank-line-separated blocks
  const blocks = cleaned.split(/\n\s*\n/).filter((s) => s.trim().length > 20)
  if (blocks.length >= 2) return blocks.map((b) => b.trim())

  // Strategy 4: Numbered entries [1], [2], etc.
  const numbered = cleaned
    .split(/\n?\[\d+\]\s*/)
    .filter((s) => s.trim().length > 10)
  if (numbered.length >= 2) return numbered.map((n) => n.trim())

  // Strategy 5: Lines that start with a capitalized word followed by year-like pattern
  // Catches dense reference lists without blank lines
  const lineStartRe = /\n(?=[A-Z][a-zA-Zà-öø-ÿ'-]+[\s,])/g
  const lineParts = cleaned.split(lineStartRe).filter((s) => {
    const trimmed = s.trim()
    return trimmed.length > 20 && /\b(19|20)\d{2}\b/.test(trimmed)
  })
  if (lineParts.length >= 2) return lineParts.map((l) => l.trim())

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
  const nonDoi = matches.find((u) => !u.includes('doi.org'))
  return nonDoi ?? matches[0]
}

function extractYear(text: string): string {
  // APA: Author (Year).
  const parenYear = text.match(/\((\d{4})[a-z]?[,)]/)
  if (parenYear) return parenYear[1]

  // Indonesian: Author. Year. or Author, Year,
  const dotYear = text.match(
    /^[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý',-\s]+?[.,]\s*((?:19|20)\d{2})[a-z]?\s*[.,]/,
  )
  if (dotYear) return dotYear[1]

  // IEEE: (Year) after quotes
  const quoteYear = text.match(/\((\d{4})\)\s*[''"]/)
  if (quoteYear) return quoteYear[1]

  // Fallback: first 4-digit year
  const anyYear = text.match(/\b(19\d{2}|20[0-2]\d)\b/)
  return anyYear ? anyYear[1] : 'n.d.'
}

function extractAuthorAndRest(
  text: string,
): { author: string; rest: string } | null {
  // APA: "Surname, F. M., Surname, F., & Surname, F. (Year)."
  const apaMatch = text.match(
    /^(.+?)\s*\((\d{4})[a-z]?(?:,\s*\w+)?\)\.\s*(.*)$/s,
  )
  if (apaMatch) {
    return {
      author: apaMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: apaMatch[3],
    }
  }

  // Indonesian: "Author. Year. Title..." or "Author, F. Year. Title..."
  // e.g., "Abdul Majid. 2007. Perencanaan pembelajaran..."
  // e.g., "Achmad Alfianto. 2006. Pembelajaran..."
  const idnMatch = text.match(
    /^(.+?)[.,]\s*((?:19|20)\d{2})[a-z]?\s*[.,]\s*(.*)$/s,
  )
  if (idnMatch) {
    return {
      author: idnMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: idnMatch[3],
    }
  }

  // IEEE: "Author, F. et al. (Year) 'Title'..."
  const ieeeMatch = text.match(
    /^(.+?)\s*\((\d{4})\)\s*[''"]?\s*(.*)$/s,
  )
  if (ieeeMatch) {
    return {
      author: ieeeMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: ieeeMatch[3],
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
  // Strip leading quotes (IEEE style: 'Title' or "Title")
  const unquoted = rest.replace(/^[''""]+/, '')

  // Title ends at first period followed by space + uppercase, or closing quote
  const titleMatch = unquoted.match(/^(.+?)[.'""]\s+(?=[A-Z]|$)/s)
  if (titleMatch && titleMatch[1].length > 5) return titleMatch[1].trim()

  // Try: everything up to first period + space + uppercase
  const periodMatch = unquoted.match(/^(.+?)\.\s+(?=[A-Z])/s)
  if (periodMatch && periodMatch[1].length > 5) return periodMatch[1].trim()

  return unquoted.slice(0, 200).replace(/[.'""]\s*$/, '').trim()
}

function extractPublisherJournal(
  rest: string,
  title: string,
): { publisher: string | null; journal: string | null } {
  const titleIdx = rest.indexOf(title)
  if (titleIdx === -1) return { publisher: null, journal: null }

  const afterTitle = rest.slice(titleIdx + title.length).trim()
  const cleaned = afterTitle
    .replace(/^[.,'""]+\s*/, '')
    .replace(DOI_RE, '')
    .replace(URL_RE, '')
    .replace(/\bdiakses\b.*$/i, '')
    .replace(/\btersedia\b.*$/i, '')
    .replace(/\bretrieved\b.*$/i, '')
    .replace(/\bavailable\b.*$/i, '')
    .replace(/\[(?:daring|online|Disertasi|Skripsi|Tesis)\]/gi, '')
    .trim()

  if (!cleaned || cleaned.length < 3) return { publisher: null, journal: null }

  // Journal: contains volume/issue like "46(3)" or "vol. 22"
  if (/\d+\(\d+\)/.test(cleaned) || /,\s*\d+\s*[,(]/.test(cleaned) || /vol\.\s*\d+/i.test(cleaned)) {
    return { publisher: null, journal: cleaned.replace(/\.\s*$/, '') }
  }

  // Publisher: "City: Publisher" pattern
  if (cleaned.includes(': ')) {
    return { publisher: cleaned.replace(/\.\s*$/, ''), journal: null }
  }

  // Likely publisher name without city
  if (cleaned.length > 3 && cleaned.length < 100) {
    return { publisher: cleaned.replace(/\.\s*$/, ''), journal: null }
  }

  return { publisher: null, journal: null }
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
