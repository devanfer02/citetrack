import PizZip from 'pizzip'
import { isItalicFix } from './eligibility'
import type { ChangeLog, Finding } from './types'

const DOCUMENT_PATH = 'word/document.xml'
const WT_RE = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g

type Part =
  | { kind: 'literal'; xml: string }
  | { kind: 'wt'; open: string; close: string; text: string }

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Split document.xml into a stream of literal chunks and editable <w:t> text
// parts, preserving everything between the text nodes verbatim.
export function parseParts(xml: string): Part[] {
  const parts: Part[] = []
  let lastIndex = 0
  WT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WT_RE.exec(xml)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'literal', xml: xml.slice(lastIndex, match.index) })
    }
    parts.push({
      kind: 'wt',
      open: match[1]!,
      close: match[3]!,
      text: decodeXml(match[2]!),
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < xml.length) {
    parts.push({ kind: 'literal', xml: xml.slice(lastIndex) })
  }
  return parts
}

export function serializeParts(parts: readonly Part[]): string {
  return parts
    .map((p) =>
      p.kind === 'literal' ? p.xml : `${p.open}${encodeXml(p.text)}${p.close}`,
    )
    .join('')
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

type Occurrence = { start: number; score: number }

// All start indices of `token` in `text`, scored by how well the text on each
// side of the occurrence matches the excerpt around the token. Anchoring at the
// token boundary (suffix-match on the left, prefix-match on the right) is what
// distinguishes occurrences when the whole snippet is short — a plain window
// comparison would score every occurrence identically.
function findOccurrences(
  text: string,
  token: string,
  excerpt: string | null,
): Occurrence[] {
  const tokenNorm = normalizeWhitespace(token)
  const exNorm = excerpt ? normalizeWhitespace(excerpt) : null
  const tokenAt = exNorm ? exNorm.indexOf(tokenNorm) : -1
  const leftWanted = tokenAt >= 0 ? exNorm!.slice(0, tokenAt).trim() : null
  const rightWanted =
    tokenAt >= 0 ? exNorm!.slice(tokenAt + tokenNorm.length).trim() : null

  const occurrences: Occurrence[] = []
  let from = 0
  for (;;) {
    const start = text.indexOf(token, from)
    if (start === -1) break
    let score = 0
    if (leftWanted !== null && rightWanted !== null) {
      const leftActual = normalizeWhitespace(text.slice(Math.max(0, start - 40), start))
      const rightActual = normalizeWhitespace(
        text.slice(start + token.length, start + token.length + 40),
      )
      score =
        commonSuffixLength(leftActual, leftWanted) +
        commonPrefixLength(rightActual, rightWanted)
    }
    occurrences.push({ start, score })
    from = start + Math.max(1, token.length)
  }
  return occurrences
}

type Range = {
  start: number
  end: number
  replacement: string
  finding: Finding
}

function pushUnlocated(log: ChangeLog, f: Finding, reason: string): void {
  log.unlocated.push({
    findingId: f.id,
    pageNumber: f.pageNumber,
    ruleId: f.ruleId,
    token: f.token ?? '',
    suggestion: f.suggestion ?? '',
    reason,
  })
}

// Choose one non-overlapping replacement range per finding against the
// concatenated document text. Findings whose token can't be found, or whose
// best location collides with an already-chosen range, are recorded as
// unlocated rather than guessed.
function planRanges(
  text: string,
  findings: readonly Finding[],
  log: ChangeLog,
): Range[] {
  const candidates: Range[] = []
  for (const f of findings) {
    // Italicising means splitting <w:r> runs in the student's own .docx, which
    // risks corrupting their file — so we don't auto-apply it here. List the
    // word for the student to italicise by hand instead.
    if (isItalicFix(f)) {
      pushUnlocated(log, f, 'jadikan miring sendiri di dokumenmu')
      continue
    }
    const { token, suggestion } = f
    if (!token || !suggestion) {
      pushUnlocated(log, f, 'data perbaikan tidak lengkap')
      continue
    }
    const occurrences = findOccurrences(text, token, f.excerpt)
    if (occurrences.length === 0) {
      pushUnlocated(log, f, 'tidak ditemukan di dokumen')
      continue
    }
    const best = occurrences.reduce((a, b) => (b.score > a.score ? b : a))
    candidates.push({
      start: best.start,
      end: best.start + token.length,
      replacement: suggestion,
      finding: f,
    })
  }

  candidates.sort((a, b) => a.start - b.start)
  const accepted: Range[] = []
  let lastEnd = -1
  for (const range of candidates) {
    if (range.start < lastEnd) {
      pushUnlocated(log, range.finding, 'tumpang tindih dengan perbaikan lain')
      continue
    }
    accepted.push(range)
    lastEnd = range.end
  }
  return accepted
}

type SubEdit = { localStart: number; localEnd: number; insert: string }

// Apply chosen ranges to the editable parts. A range spanning several <w:t>
// nodes puts the whole replacement into the first node and removes the matched
// characters from the rest, so formatting on untouched runs survives.
function applyRanges(parts: Part[], ranges: readonly Range[], log: ChangeLog) {
  const wtParts: Array<{ index: number; start: number; len: number }> = []
  let offset = 0
  parts.forEach((p, index) => {
    if (p.kind === 'wt') {
      wtParts.push({ index, start: offset, len: p.text.length })
      offset += p.text.length
    }
  })

  const subEdits = new Map<number, SubEdit[]>()
  const addSub = (partIndex: number, edit: SubEdit) => {
    const list = subEdits.get(partIndex)
    if (list) list.push(edit)
    else subEdits.set(partIndex, [edit])
  }

  for (const range of ranges) {
    const first = wtParts.find(
      (w) => range.start >= w.start && range.start < w.start + w.len,
    )
    const last = wtParts.find(
      (w) => range.end > w.start && range.end <= w.start + w.len,
    )
    if (!first || !last) {
      pushUnlocated(log, range.finding, 'tidak ditemukan di dokumen')
      continue
    }
    const localStart = range.start - first.start
    const localEnd = range.end - last.start
    if (first.index === last.index) {
      addSub(first.index, { localStart, localEnd, insert: range.replacement })
    } else {
      addSub(first.index, {
        localStart,
        localEnd: first.len,
        insert: range.replacement,
      })
      for (const w of wtParts) {
        if (w.index > first.index && w.index < last.index) {
          addSub(w.index, { localStart: 0, localEnd: w.len, insert: '' })
        }
      }
      addSub(last.index, { localStart: 0, localEnd, insert: '' })
    }
    const f = range.finding
    log.applied.push({
      findingId: f.id,
      pageNumber: f.pageNumber,
      category: f.category,
      ruleId: f.ruleId,
      kind: 'replace',
      before: f.token ?? '',
      after: f.suggestion ?? '',
    })
  }

  for (const [partIndex, edits] of subEdits) {
    const part = parts[partIndex]
    if (part?.kind !== 'wt') continue
    let text = part.text
    for (const edit of edits.toSorted((a, b) => b.localStart - a.localStart)) {
      text = text.slice(0, edit.localStart) + edit.insert + text.slice(edit.localEnd)
    }
    part.text = text
  }
}

// Pure core: rewrite a document.xml string by applying selected findings.
export function patchDocumentXml(
  xml: string,
  findings: readonly Finding[],
  log: ChangeLog,
): string {
  const parts = parseParts(xml)
  const concat = parts.reduce(
    (acc, p) => (p.kind === 'wt' ? acc + p.text : acc),
    '',
  )
  const ranges = planRanges(concat, findings, log)
  applyRanges(parts, ranges, log)
  return serializeParts(parts)
}

// Has-docx path: patch the student's uploaded .docx in place, preserving its
// formatting. Returns the rewritten document bytes plus the change log.
export function patchDocx(
  docxBytes: Buffer | ArrayBuffer | Uint8Array,
  findings: readonly Finding[],
  log: ChangeLog,
): Buffer {
  const zip = new PizZip(docxBytes)
  const docFile = zip.file(DOCUMENT_PATH)
  if (!docFile) throw new Error('File .docx tidak valid: word/document.xml tidak ditemukan')
  const xml = docFile.asText()
  zip.file(DOCUMENT_PATH, patchDocumentXml(xml, findings, log))
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
