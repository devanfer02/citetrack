#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { parseReferences } from '#/services/parser/reference-parser'
import {
  findPdfDiagnostic,
  type ProviderAttempt,
  type ProviderName,
} from '#/services/pdf/finder'

const THESIS_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example.pdf',
)
const OUTPUT_DIR = resolve(process.cwd(), 'scripts/output')
const OUTPUT_JSON = resolve(OUTPUT_DIR, 'autofetch-diagnostic.json')

const DOWNLOAD_TIMEOUT_MS = 15_000
const REF_LIMIT = Number(process.env.REF_LIMIT ?? '0') || Infinity
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '4')

interface DownloadProbe {
  url: string
  source: ProviderName
  attempted: boolean
  ok: boolean
  httpStatus: number | null
  bytes: number | null
  contentType: string | null
  extractedPages: number | null
  error: string | null
  durationMs: number
}

interface RefReport {
  index: number
  rawText: string
  doi: string | null
  title: string
  author: string
  attempts: ProviderAttempt[]
  downloads: DownloadProbe[]
  firstUrlProvider: ProviderName | null
  firstUrlProbe: DownloadProbe | null
  productionWouldSucceed: boolean
  anyProviderWouldSucceed: boolean
  rescuedBy: ProviderName | null
}

const probeDownload = async (
  url: string,
  source: ProviderName,
): Promise<DownloadProbe> => {
  const t0 = Date.now()
  const empty: DownloadProbe = {
    url,
    source,
    attempted: true,
    ok: false,
    httpStatus: null,
    bytes: null,
    contentType: null,
    extractedPages: null,
    error: null,
    durationMs: 0,
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: 'follow',
    })
    empty.httpStatus = res.status
    empty.contentType = res.headers.get('content-type')
    if (!res.ok) {
      empty.error = `HTTP ${res.status}`
      empty.durationMs = Date.now() - t0
      return empty
    }
    const buffer = new Uint8Array(await res.arrayBuffer())
    empty.bytes = buffer.byteLength
    if (buffer.byteLength === 0) {
      empty.error = 'empty body'
      empty.durationMs = Date.now() - t0
      return empty
    }
    // Attempt extraction — but only if it looks like a PDF
    const looksLikePdf =
      buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    if (!looksLikePdf) {
      empty.error = `not a PDF (magic bytes: ${buffer.slice(0, 4).map((b) => b.toString(16)).join(' ')})`
      empty.durationMs = Date.now() - t0
      return empty
    }
    try {
      const extracted = await extractPdfText(buffer)
      empty.extractedPages = extracted.pages.length
      empty.ok = extracted.pages.length > 0
      if (!empty.ok) empty.error = 'PDF extracted to 0 pages (scanned image only?)'
    } catch (err) {
      empty.error = `extract failed: ${err instanceof Error ? err.message : String(err)}`
    }
    empty.durationMs = Date.now() - t0
    return empty
  } catch (err) {
    empty.error = err instanceof Error ? err.message : String(err)
    empty.durationMs = Date.now() - t0
    return empty
  }
}

const summarizeRef = (
  index: number,
  ref: ReturnType<typeof parseReferences>[number],
  attempts: ProviderAttempt[],
  downloads: DownloadProbe[],
): RefReport => {
  const firstAttemptWithUrl = attempts.find((a) => a.result !== null)
  const firstUrlProvider = firstAttemptWithUrl?.result?.source as ProviderName | undefined
  const firstUrlProbe =
    downloads.find((d) => d.source === firstUrlProvider) ?? null
  const productionWouldSucceed = firstUrlProbe?.ok === true
  const rescuedBy =
    productionWouldSucceed
      ? null
      : (downloads.find((d) => d.ok && d.source !== firstUrlProvider)?.source ?? null)
  const anyProviderWouldSucceed = downloads.some((d) => d.ok)

  return {
    index,
    rawText: ref.rawText.slice(0, 200),
    doi: ref.doi,
    title: ref.title,
    author: ref.author,
    attempts,
    downloads,
    firstUrlProvider: firstUrlProvider ?? null,
    firstUrlProbe,
    productionWouldSucceed,
    anyProviderWouldSucceed,
    rescuedBy,
  }
}

const main = async () => {
  await mkdir(OUTPUT_DIR, { recursive: true })

  console.log(`[test-autofetch] Reading ${THESIS_PDF}`)
  const buffer = await readFile(THESIS_PDF)
  const extracted = await extractPdfText(new Uint8Array(buffer))
  console.log(`[test-autofetch] Extracted ${extracted.pages.length} pages`)

  const refs = parseReferences(extracted.pages)
  console.log(`[test-autofetch] Parsed ${refs.length} references`)

  const refsToTry = refs.slice(0, REF_LIMIT === Infinity ? refs.length : REF_LIMIT)
  console.log(
    `[test-autofetch] Probing ${refsToTry.length} refs (DOWNLOAD_TIMEOUT_MS=${DOWNLOAD_TIMEOUT_MS}, CONCURRENCY=${CONCURRENCY})`,
  )

  const reports: RefReport[] = []
  let idx = 0
  const worker = async (): Promise<void> => {
    while (idx < refsToTry.length) {
      const i = idx++
      const ref = refsToTry[i]
      const label = `[${i + 1}/${refsToTry.length}]`
      console.log(`${label} title="${ref.title.slice(0, 60)}…" doi=${ref.doi ?? '(none)'}`)
      const attempts = await findPdfDiagnostic({
        doi: ref.doi,
        title: ref.title,
        author: ref.author,
      })
      const downloads: DownloadProbe[] = []
      const probedUrls = new Set<string>()
      for (const a of attempts) {
        if (!a.result || probedUrls.has(a.result.url)) continue
        probedUrls.add(a.result.url)
        const probe = await probeDownload(a.result.url, a.result.source as ProviderName)
        downloads.push(probe)
      }
      const report = summarizeRef(i, ref, attempts, downloads)
      reports[i] = report
      const status = report.productionWouldSucceed
        ? 'OK'
        : report.rescuedBy
          ? `WOULD-RESCUE-BY:${report.rescuedBy}`
          : report.anyProviderWouldSucceed
            ? 'OK (but not via first provider)'
            : 'NO-PROVIDER-WORKED'
      console.log(`${label} -> first=${report.firstUrlProvider ?? '(none)'} ${status}`)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, refsToTry.length) }, () => worker()),
  )

  await writeFile(OUTPUT_JSON, JSON.stringify(reports, null, 2))

  const total = reports.length
  const noProvider = reports.filter((r) => r.attempts.every((a) => a.result === null)).length
  const productionSucceeds = reports.filter((r) => r.productionWouldSucceed).length
  const couldBeRescued = reports.filter((r) => !r.productionWouldSucceed && r.rescuedBy).length
  const fullyDead = reports.filter((r) => !r.anyProviderWouldSucceed && !noProvider).length

  const byFirstProvider = new Map<string, number>()
  for (const r of reports) {
    const key = r.firstUrlProvider ?? '(none)'
    byFirstProvider.set(key, (byFirstProvider.get(key) ?? 0) + 1)
  }

  const rescuersByProvider = new Map<string, number>()
  for (const r of reports) {
    if (r.rescuedBy) {
      const key = `${r.firstUrlProvider ?? 'none'} -> ${r.rescuedBy}`
      rescuersByProvider.set(key, (rescuersByProvider.get(key) ?? 0) + 1)
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Total references parsed: ${refs.length}`)
  console.log(`Probed: ${total}`)
  console.log(`  Production code would succeed (current short-circuit): ${productionSucceeds}`)
  console.log(`  Production fails BUT a later provider returned a working PDF: ${couldBeRescued}`)
  console.log(`  No provider returned any URL: ${noProvider}`)
  console.log(`  All providers either gave no URL or all URLs failed download: ${fullyDead}`)

  console.log('\n=== First-URL provider distribution ===')
  for (const [provider, count] of [...byFirstProvider.entries()].toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${provider}: ${count}`)
  }

  console.log('\n=== Refs that would be rescued by fallback ===')
  if (rescuersByProvider.size === 0) {
    console.log('  (none — bug not observable in this sample, or all first-providers worked)')
  } else {
    for (const [transition, count] of [...rescuersByProvider.entries()].toSorted((a, b) => b[1] - a[1])) {
      console.log(`  ${transition}: ${count}`)
    }
  }

  console.log(`\nFull report written to ${OUTPUT_JSON}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
