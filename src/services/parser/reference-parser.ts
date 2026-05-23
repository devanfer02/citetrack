const HEADING_PATTERNS = [
  /daftar\s+pustaka/i,
  /daftar\s+referensi/i,
  /bibliography/i,
  /kepustakaan/i,
  /references?/i,
  /referensi/i,
]

const DOI_RE = /\b(?:doi:\s*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,)]+[^\s,).:])/i
const URL_RE = /https?:\/\/[^\s,)>\]]+/g

function stripLeadingPageNumber(content: string): string {
  return content.replace(/^\s*\d{1,4}\s+/, '')
}

function findRepeatingLines(pages: { content: string }[]): Set<string> {
  if (pages.length < 2) return new Set()
  const lineCounts = new Map<string, number>()
  for (const page of pages) {
    const unique = new Set(
      page.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    )
    for (const line of unique) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1)
    }
  }
  const repeating = new Set<string>()
  for (const [line, count] of lineCounts) {
    if (count > 1 && count >= Math.ceil(pages.length * 0.5)) {
      repeating.add(line)
    }
  }
  return repeating
}

function findRepeatingHeaderPrefix(pages: { content: string }[]): string {
  // Detects a running page header that appears at the start of each page but
  // differs only by the page number. Returns the common prefix (header text,
  // sans the varying number), or '' if no such header exists.
  if (pages.length < 2) return ''
  const leaders = pages
    .map((p) => stripLeadingPageNumber(p.content).slice(0, 400))
    .filter((s) => s.length > 20)
  if (leaders.length < 2) return ''

  let prefix = leaders[0]
  for (const leader of leaders.slice(1)) {
    let i = 0
    while (i < prefix.length && i < leader.length) {
      const a = prefix[i]
      const b = leader[i]
      if (a === b) {
        i++
        continue
      }
      if (/\d/.test(a) && /\d/.test(b)) {
        i++
        continue
      }
      break
    }
    prefix = prefix.slice(0, i)
    if (prefix.length < 20) return ''
  }
  return prefix.replace(/\s+\d+\s*$/, '').trim()
}

function stripRepeatingHeader(content: string, headerWords: string[]): string {
  if (headerWords.length === 0) return content
  let idx = 0
  for (const word of headerWords) {
    const pos = content.indexOf(word, idx)
    if (pos === -1) return content
    idx = pos + word.length
  }
  while (idx < content.length && /[\d\s]/.test(content[idx])) idx++
  return content.slice(idx)
}

function stripHeadersAndPageNumbers(
  content: string,
  headers: Set<string>,
): string {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^\d{1,3}$/.test(trimmed)) return false
      if (headers.has(trimmed)) return false
      return true
    })
    .join('\n')
}

export function detectReferenceSection(
  pages: { pageNumber: number; content: string }[],
): ReferenceSection | null {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    for (const pattern of HEADING_PATTERNS) {
      if (pattern.test(page.content)) {
        const refPages = pages.slice(i)
        const repeatLines = findRepeatingLines(refPages)
        const runningHeader = findRepeatingHeaderPrefix(refPages)
        const headerWords = runningHeader
          .split(/\s+/)
          .filter((w) => w.length > 2 && !/^\d+$/.test(w))
        const text = refPages
          .map((p) => {
            let c = stripHeadersAndPageNumbers(p.content, repeatLines)
            c = stripLeadingPageNumber(c)
            if (headerWords.length >= 4) {
              c = stripRepeatingHeader(c, headerWords)
            }
            return c
          })
          .join('\n')
        return { startPage: page.pageNumber, text }
      }
    }
  }
  return null
}

function stripBeforeHeading(text: string): string {
  // Walk heading patterns and pick the last occurrence so body-text mentions of
  // "references" don't short-circuit the real bibliography heading.
  let cut = -1
  for (const pattern of HEADING_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = globalPattern.exec(text)) !== null) {
      const candidate = m.index + m[0].length
      if (candidate > cut) cut = candidate
    }
  }
  return cut >= 0 ? text.slice(cut).trim() : text.trim()
}

const NAME_PIECE = "[A-ZÀ-Ý][A-Za-zÀ-ÿ']+"
// NAME_TOKEN handles hyphenated surnames like "Al-Azawi" or PDF-extraction
// artifacts like "Al - Azawi" where the extractor inserts spaces around "-".
const NAME_TOKEN = `${NAME_PIECE}(?:\\s*[-–]\\s*${NAME_PIECE})*`
const NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,3}`
// INITIALS may end with a compound first name like "W. Ben" (Abdessalem) —
// zero to two additional capitalized word tokens after the initials.
const INITIALS = `[A-Z]\\.(?:[\\s\\-]?[A-Z]\\.?){0,4}(?:\\s+[A-Z][A-Za-zÀ-ÿ']+){0,2}`
const AUTHOR_WITH_INITIALS = `${NAME}(?:,\\s*${INITIALS})?`
// AUTHOR_SEP covers: ", ", ", & ", ", and ", ", …, ", " … ", " & ", " and ",
// " dan " (Indonesian), and bare ellipsis between author blocks.
const AUTHOR_SEP =
  "(?:\\s*,\\s*(?:&|and|dan|…)?\\s*|\\s+(?:&|and|dan)\\s+|\\s*…\\s*,?\\s*)"
const AUTHORS_LIST =
  `${AUTHOR_WITH_INITIALS}(?:${AUTHOR_SEP}${AUTHOR_WITH_INITIALS})*` +
  `(?:\\s+et\\s+al\\.?)?`
const YEAR_PAREN = '\\(\\d{4}[a-z]?\\)'
const YEAR_COMMA = ',\\s*\\d{4}[a-z]?\\.'
const ANCHOR_SRC = `${AUTHORS_LIST}\\s*(?:${YEAR_PAREN}|${YEAR_COMMA})`

// Sub-anchors inside an ongoing author list (e.g. "Wei, S.-C." nested inside
// "Lai, W.-K., Wang, Y.-C. and Wei, S.-C., 2023.") must be rejected so we
// don't split a single entry into fragments. We detect them by the trailing
// shape of the 30-char window preceding the candidate: a single-letter
// initial followed by a connector (",", " & ", " and ", ellipsis, …) is only
// plausible if we're still inside the same author list.
const MID_AUTHOR_LIST_RE =
  /(?:^|[^A-Za-z])[A-Z]\.\s*(?:,\s*(?:&|and|dan|…)?\s*|\s+(?:&|and|dan|…)\s+|\s*,?\s*…\s*,?\s*)$/

function isMidAuthorList(text: string, pos: number): boolean {
  const window = text.slice(Math.max(0, pos - 30), pos)
  return MID_AUTHOR_LIST_RE.test(window)
}

function splitByFlatAnchors(text: string): string[] {
  // Find all "author list + year" anchor positions in flattened text. The
  // regex engine's /g flag auto-advances lastIndex to the end of each match,
  // which skips over nested sub-anchors inside a multi-author list (e.g.
  // "Wei, S.-C." inside "Lai, W.-K., Wang, Y.-C. and Wei, S.-C., 2023.").
  // The isMidAuthorList fallback still guards against the rare case where a
  // longer outer match fails but an inner sub-anchor matches independently.
  const anchor = new RegExp(ANCHOR_SRC, 'g')
  const positions: number[] = []
  let m: RegExpExecArray | null
  while ((m = anchor.exec(text)) !== null) {
    const pos = m.index
    if (isMidAuthorList(text, pos)) continue
    positions.push(pos)
  }
  if (positions.length < 2) return []

  const entries: string[] = []
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]
    const end = i + 1 < positions.length ? positions[i + 1] : text.length
    const slice = text.slice(start, end).trim()
    // Every anchor position was matched against a YEAR pattern, so we know
    // the slice contains a plausible year (including APA suffix forms like
    // "2025a"). A bare length floor is enough as a final sanity filter.
    if (slice.length > 20) entries.push(slice)
  }
  return entries
}

function splitByAuthorYearLines(text: string): string[] {
  const lines = text.split('\n')
  const entries: string[] = []
  let current = ''

  const entryStartRe =
    /^[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+[,.]?\s+.*\b(19|20)\d{2}\b/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current) entries.push(current.trim())
      current = ''
      continue
    }

    if (entryStartRe.test(trimmed) && current) {
      entries.push(current.trim())
      current = trimmed
    } else {
      const lastToken = current.split(/\s/).pop() ?? ''
      const isPartialUrl =
        /^https?:\/\//.test(lastToken) ||
        /^(?:doi:?\s*)?10\.\d/.test(lastToken)
      const continuesUrl = /^[a-zA-Z0-9._/?=&#%-]/.test(trimmed)
      const sep = current ? (isPartialUrl && continuesUrl ? '' : ' ') : ''
      current += sep + trimmed
    }
  }

  if (current) entries.push(current.trim())
  return entries.filter((e) => e.length > 20 && /\b(19|20)\d{2}\b/.test(e))
}

function joinUrlContinuations(text: string): string {
  // PDFs sometimes wrap long DOIs/URLs across lines. Re-stitch any line that
  // begins with URL-safe chars onto the previous line when the previous line
  // ended with a URL or DOI fragment.
  const lines = text.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (out.length === 0) {
      out.push(line)
      continue
    }
    const prev = out[out.length - 1]
    const lastToken = prev.split(/\s/).pop() ?? ''
    const isPartialUrl =
      /^https?:\/\//.test(lastToken) ||
      /^(?:doi:?\s*)?10\.\d/.test(lastToken)
    const trimmed = line.trim()
    const continuesUrl = /^[a-zA-Z0-9._/?=&#%-]+\.?$/.test(trimmed)
    if (isPartialUrl && continuesUrl) {
      out[out.length - 1] = prev + trimmed
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

function splitReferenceEntries(text: string): string[] {
  const cleaned = joinUrlContinuations(stripBeforeHeading(text))

  // Numbered entries [1], [2] — most specific, try first.
  const numbered = cleaned
    .split(/\n?\[\d+\]\s*/)
    .filter((s) => s.trim().length > 10)
  if (numbered.length >= 2) return numbered.map((n) => n.trim())

  // Flat-anchor split — works when PDF extraction flattens everything into one line.
  const flat = splitByFlatAnchors(cleaned)
  if (flat.length >= 2) return flat

  // Line-by-line heuristic — works when the extractor preserves line breaks.
  const heuristicParts = splitByAuthorYearLines(cleaned)
  if (heuristicParts.length >= 2) return heuristicParts

  const blocks = cleaned.split(/\n\s*\n/).filter((s) => s.trim().length > 20)
  if (blocks.length >= 2) return blocks.map((b) => b.trim())

  const idnStyleRe =
    /(?:^|\n{2,})(?=[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+(?:[.,]\s*(?:[A-Z]\.?\s*)*)?(?:\s+(?:dan|and|&)\s+[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+(?:[.,]\s*(?:[A-Z]\.?\s*)*)?)?\s*[.,]?\s*(?:\(?\d{4}\)?))/g
  const idnParts = cleaned.split(idnStyleRe).filter((s) => s.trim().length > 20)
  if (idnParts.length >= 2) return idnParts.map((p) => p.trim())

  const authorLineRe =
    /(?:^|\n{2,})(?=[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'-]+,\s*[A-Z]\.)/g
  const apaParts = cleaned.split(authorLineRe).filter((s) => s.trim().length > 20)
  if (apaParts.length >= 2) return apaParts.map((p) => p.trim())

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
  const parenYear = text.match(/\((\d{4})[a-z]?[,)]/)
  if (parenYear) return parenYear[1]

  const dotYear = text.match(
    /^[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý',-\s]+?[.,]\s*((?:19|20)\d{2})[a-z]?\s*[.,]/,
  )
  if (dotYear) return dotYear[1]

  const quoteYear = text.match(/\((\d{4})\)\s*[''"]/)
  if (quoteYear) return quoteYear[1]

  const anyYear = text.match(/\b(19\d{2}|20[0-2]\d)\b/)
  return anyYear ? anyYear[1] : 'n.d.'
}

function extractAuthorAndRest(
  text: string,
): { author: string; rest: string } | null {
  // APA: "Surname, F. M., Surname, F., & Surname, F. (Year). Title..."
  const apaMatch = text.match(
    /^(.+?)\s*\((\d{4})[a-z]?(?:,\s*\w+)?\)\.\s*(.*)$/s,
  )
  if (apaMatch) {
    return {
      author: apaMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: apaMatch[3],
    }
  }

  // Harvard-paren: "Author, F. et al. (Year) 'Title'..." (note: no period after year-parens)
  const ieeeMatch = text.match(
    /^(.+?)\s*\((\d{4})[a-z]?\)\s*['''""]?\s*(.*)$/s,
  )
  if (ieeeMatch) {
    return {
      author: ieeeMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: ieeeMatch[3],
    }
  }

  // Harvard-comma: "Author, F. and Author, F., Year. Title..." / "OrgName, Year. Title..."
  const harvardCommaMatch = text.match(
    /^(.+?),\s*((?:19|20)\d{2})[a-z]?\.\s+(.*)$/s,
  )
  if (harvardCommaMatch) {
    const author = harvardCommaMatch[1].replace(/[.,\s]+$/, '').trim()
    // Guard: author must look like names (capitalized tokens), not a sentence body.
    // Reject if author contains lowercase-dominant runs suggesting prose.
    if (/[A-Z]/.test(author) && author.length < 200) {
      return { author, rest: harvardCommaMatch[3] }
    }
  }

  // Indonesian: "Author. Year. Title..." or "Author, F. Year. Title..."
  const idnMatch = text.match(
    /^(.+?)[.,]\s*((?:19|20)\d{2})[a-z]?\s*[.,]\s*(.*)$/s,
  )
  if (idnMatch) {
    return {
      author: idnMatch[1].replace(/[.,\s]+$/, '').trim(),
      rest: idnMatch[3],
    }
  }

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
  const unquoted = rest.replace(/^[''""]+/, '')

  const titleMatch = unquoted.match(/^(.+?)[.'""]\s+(?=[A-Z]|$)/s)
  if (titleMatch && titleMatch[1].length > 5) return titleMatch[1].trim()

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

  if (/\d+\(\d+\)/.test(cleaned) || /,\s*\d+\s*[,(]/.test(cleaned) || /vol\.\s*\d+/i.test(cleaned)) {
    return { publisher: null, journal: cleaned.replace(/\.\s*$/, '') }
  }

  if (cleaned.includes(': ')) {
    return { publisher: cleaned.replace(/\.\s*$/, ''), journal: null }
  }

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
