#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractPdfText } from '#/services/pdf/extractor'
import { type EmbeddingModel } from '#/lib/configurations'
import { type Embedder, makeEmbedder } from '#/services/matcher/embedder'
import {
  buildWindows,
  matchPassage,
  windowCacheKey,
} from '#/services/matcher/passage-matcher'
import {
  groupCitations,
  parseCitationsFromPages,
} from '#/services/parser/citation-parser'

async function precomputeEmbeddings(
  embedder: Embedder | null,
  pages: SourcePage[],
): Promise<Map<string, Float32Array> | undefined> {
  if (!embedder) return undefined
  const windows = buildWindows(pages)
  if (windows.length === 0) return new Map()
  const texts = windows.map((w) => w.text)
  const embeddings = await embedder.embedPassages(texts)
  const map = new Map<string, Float32Array>()
  for (let i = 0; i < windows.length; i++) {
    map.set(
      windowCacheKey(windows[i].pageNumber, windows[i].windowIdx),
      embeddings[i],
    )
  }
  return map
}

const THESIS_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example.pdf',
)
const UNRELATED_PDF = resolve(process.cwd(), '.claude/pdf_examples/14484.pdf')
const OUT_DIR = resolve(process.cwd(), '.claude/scripts/output')
const REPORT_DIR = resolve(process.cwd(), 'docs/track')

const MAX_THESIS_PAGES = Number.parseInt(
  process.env.MAX_THESIS_PAGES ?? '30',
  10,
)

const MODELS: readonly EmbeddingModel[] = [
  'none',
  'paraphrase-minilm-l12-v2',
  'multilingual-e5-small',
  'multilingual-e5-base',
]

interface CrossLingualPair {
  name: string
  thesis: string
  targetSentence: string
  sourceContent: string
}

const CROSS_LINGUAL_FIXTURE: CrossLingualPair[] = [
  {
    name: 'kotlin-java-interop',
    thesis:
      'Kotlin dapat bekerja dengan library bawaan dan yang sudah ada dari Java dan berjalan dengan performa yang sama dengan bahasa pemrograman Java (Jemerov & Isakova, 2017).',
    targetSentence:
      'Kotlin works seamlessly with existing Java libraries and the runtime performance is on par with Java.',
    sourceContent:
      'Kotlin works seamlessly with existing Java libraries and the runtime performance is on par with Java. Variables in Kotlin are declared with val or var keywords. Object-oriented programming patterns are heavily used across the standard library. Memory allocation in Kotlin follows JVM conventions.',
  },
  {
    name: 'gamification-definition',
    thesis:
      'Gamifikasi adalah penerapan elemen permainan dalam konteks non-permainan untuk meningkatkan motivasi pengguna (Al Fatta et al., 2018).',
    targetSentence:
      'Gamification refers to the use of game design elements in non-game contexts to enhance user motivation and engagement.',
    sourceContent:
      'Educational games have existed since the 1970s in formal learning settings. Gamification refers to the use of game design elements in non-game contexts to enhance user motivation and engagement. Reward systems are common in modern apps. Levels and badges drive sustained user activity.',
  },
  {
    name: 'use-case-diagram',
    thesis:
      'Diagram use case menggambarkan interaksi antara aktor dengan sistem dari sudut pandang pengguna (Abdessalem & Alkhammash, 2017).',
    targetSentence:
      'Use case diagrams illustrate the interactions between actors and the system from the end user perspective.',
    sourceContent:
      'Class diagrams describe the static structure of the system. Use case diagrams illustrate the interactions between actors and the system from the end user perspective. Sequence diagrams capture temporal ordering of method calls. State diagrams model object lifecycles.',
  },
  {
    name: 'android-back-button',
    thesis:
      'Ketika pengguna menekan tombol Kembali pada perangkat Android, aktivitas saat ini akan dikeluarkan dari tumpukan (Tewari & Singh, 2021).',
    targetSentence:
      'When the user presses the Back button on an Android device, the current activity is popped off the activity stack and the previous activity resumes.',
    sourceContent:
      'Android uses a binder mechanism for inter-process communication. When the user presses the Back button on an Android device, the current activity is popped off the activity stack and the previous activity resumes. Lifecycle callbacks include onCreate and onResume. Resource handling follows reference counting.',
  },
  {
    name: 'iot-sensor-data',
    thesis:
      'Perangkat IoT mengumpulkan data dari sensor dan mengirimkannya ke server untuk diproses lebih lanjut (Lai et al., 2023).',
    targetSentence:
      'IoT devices collect data from sensors and transmit it to a central server for further processing and analytics.',
    sourceContent:
      'Latency optimization is critical in real-time IoT applications. IoT devices collect data from sensors and transmit it to a central server for further processing and analytics. Edge computing reduces network round-trips. Battery life is a major design constraint.',
  },
  {
    name: 'reactive-state-management',
    thesis:
      'Pendekatan reaktif untuk state-management menghilangkan banyak bug yang umumnya muncul pada pemrograman imperatif (Marchenko, 2023).',
    targetSentence:
      'A reactive approach to state management eliminates many of the bugs that commonly arise in imperative programming.',
    sourceContent:
      'Functional programming emphasizes immutability and pure functions. A reactive approach to state management eliminates many of the bugs that commonly arise in imperative programming. Event streams compose well across asynchronous boundaries. Subscribers receive updates automatically.',
  },
]

interface TimingPair {
  coldLoadMs: number
  totalMatchMs: number
  perCitationMs: number
}

interface ModelReport {
  model: EmbeddingModel
  timing: TimingPair
  recall: {
    total: number
    matched: number
    correctPage: number
    avgConfidence: number
  }
  precision: {
    total: number
    correctlyRejected: number
    falsePositives: Array<{
      citationKey: string
      confidence: number
      reasoning: string
    }>
    rejectionRate: number
  }
  crossLingual: {
    total: number
    top1Correct: number
    accepted: number
    perPair: Array<{
      name: string
      accepted: boolean
      confidence: number
      passageStartsWithTarget: boolean
    }>
  }
}

async function runForModel(
  model: EmbeddingModel,
  thesisPages: SourcePage[],
  unrelatedPages: SourcePage[],
  citations: ReturnType<typeof groupCitations>,
): Promise<ModelReport> {
  console.log(`\n=== ${model} ===`)
  const embedder = makeEmbedder(model)

  // Cold load: trigger model download/load with one tiny encode
  const tColdStart = Date.now()
  if (embedder) {
    await embedder.embedQueries(['warmup'])
  }
  const coldLoadMs = Date.now() - tColdStart
  console.log(`cold load: ${coldLoadMs}ms`)

  // Precompute embeddings once per source corpus so per-citation matching
  // only pays for the query embed + cosine over cached vectors.
  const tPrecompStart = Date.now()
  const thesisEmbs = await precomputeEmbeddings(embedder, thesisPages)
  const unrelatedEmbs = await precomputeEmbeddings(embedder, unrelatedPages)
  const precomputeMs = Date.now() - tPrecompStart
  if (embedder) {
    console.log(
      `precompute: ${precomputeMs}ms (thesis windows ${thesisEmbs?.size ?? 0}, unrelated ${unrelatedEmbs?.size ?? 0})`,
    )
  }

  // Test A: self-match recall
  const tMatchStart = Date.now()
  let recallMatched = 0
  let recallCorrectPage = 0
  let recallConfSum = 0
  for (const group of citations) {
    const occ = group.occurrences[0]
    if (!occ) continue
    const result = await matchPassage(
      {
        citationKey: group.citationKey,
        thesisContext: occ.thesisContext,
        sourcePages: thesisPages,
      },
      embedder
        ? { embedder, cachedWindowEmbeddings: thesisEmbs }
        : {},
    )
    if (result) {
      recallMatched++
      recallConfSum += result.confidence
      if (result.sourcePage === occ.thesisPage) recallCorrectPage++
    }
  }
  const tMatchEnd = Date.now()

  // Test B: irrelevant-source rejection
  const falsePositives: ModelReport['precision']['falsePositives'] = []
  let correctlyRejected = 0
  for (const group of citations) {
    const occ = group.occurrences[0]
    if (!occ) continue
    const result = await matchPassage(
      {
        citationKey: group.citationKey,
        thesisContext: occ.thesisContext,
        sourcePages: unrelatedPages,
      },
      embedder
        ? { embedder, cachedWindowEmbeddings: unrelatedEmbs }
        : {},
    )
    if (result === null) {
      correctlyRejected++
    } else {
      falsePositives.push({
        citationKey: group.citationKey,
        confidence: result.confidence,
        reasoning: result.reasoning,
      })
    }
  }

  // Test C: cross-lingual fixture (small, no precompute benefit)
  const perPair: ModelReport['crossLingual']['perPair'] = []
  let crossTop1 = 0
  let crossAccepted = 0
  for (const pair of CROSS_LINGUAL_FIXTURE) {
    const fixturePages: SourcePage[] = [
      { pageNumber: 1, content: pair.sourceContent },
    ]
    const result = await matchPassage(
      {
        citationKey: pair.name,
        thesisContext: pair.thesis,
        sourcePages: fixturePages,
      },
      embedder ? { embedder } : {},
    )
    if (result) crossAccepted++
    const startsWithTarget =
      result?.matchedPassage
        .replace(/\s+/g, ' ')
        .trim()
        .startsWith(pair.targetSentence.replace(/\s+/g, ' ').trim()) ?? false
    if (startsWithTarget) crossTop1++
    perPair.push({
      name: pair.name,
      accepted: result !== null,
      confidence: result?.confidence ?? 0,
      passageStartsWithTarget: startsWithTarget,
    })
  }

  const totalMatchMs = tMatchEnd - tMatchStart
  const recallReport: ModelReport['recall'] = {
    total: citations.length,
    matched: recallMatched,
    correctPage: recallCorrectPage,
    avgConfidence:
      recallMatched > 0
        ? Math.round((recallConfSum / recallMatched) * 1000) / 1000
        : 0,
  }
  const precisionReport: ModelReport['precision'] = {
    total: citations.length,
    correctlyRejected,
    falsePositives,
    rejectionRate:
      citations.length > 0
        ? Math.round((correctlyRejected / citations.length) * 1000) / 1000
        : 0,
  }
  const crossReport: ModelReport['crossLingual'] = {
    total: CROSS_LINGUAL_FIXTURE.length,
    top1Correct: crossTop1,
    accepted: crossAccepted,
    perPair,
  }

  console.log(
    `  recall:    ${recallMatched}/${citations.length} matched (${recallCorrectPage} on correct page), avg conf ${recallReport.avgConfidence}`,
  )
  console.log(
    `  precision: ${correctlyRejected}/${citations.length} correctly rejected (rate ${(precisionReport.rejectionRate * 100).toFixed(1)}%)`,
  )
  console.log(
    `  cross-lingual: ${crossTop1}/${CROSS_LINGUAL_FIXTURE.length} top-1 correct, ${crossAccepted} accepted`,
  )
  console.log(`  total recall+precision match time: ${totalMatchMs}ms`)

  const perCitationMs =
    citations.length > 0
      ? Math.round((totalMatchMs / (citations.length * 2)) * 10) / 10
      : 0
  return {
    model,
    timing: { coldLoadMs, totalMatchMs, perCitationMs },
    recall: recallReport,
    precision: precisionReport,
    crossLingual: crossReport,
  }
}

function renderMarkdown(
  reports: ModelReport[],
  meta: {
    thesisPagesUsed: number
    thesisPagesTotal: number
    citationsInCorpus: number
    citationsTotal: number
  },
): string {
  const lines: string[] = []
  lines.push('# Embedder comparison — `thesis_example.pdf`')
  lines.push('')
  lines.push(
    `Corpus: first **${meta.thesisPagesUsed}** of ${meta.thesisPagesTotal} thesis pages, **${meta.citationsInCorpus}** of ${meta.citationsTotal} citations (those whose first occurrence falls inside the slice). Override with \`MAX_THESIS_PAGES=N bun .claude/scripts/compare-embedders.ts\`.`,
  )
  lines.push('')
  lines.push(
    'Generated by `.claude/scripts/compare-embedders.ts`. Three measurements per model:',
  )
  lines.push('')
  lines.push(
    '- **Recall (self-match)** — thesis used as its own source. Each citation should re-find the page it was extracted from. `correct_page` = top match on the same page as the citation.',
  )
  lines.push(
    '- **Precision (wrong paper)** — `14484.pdf` (an unrelated Kubernetes/IoT paper) used as the source for every citation. A correct matcher should return null for all of them. Lower `false_positives` is better.',
  )
  lines.push(
    '- **Cross-lingual fixture** — 6 handcrafted Indonesian thesis claims paired with English source paragraphs that paraphrase them plus distractors. `top1_correct` = matched passage starts with the target English sentence.',
  )
  lines.push('')
  lines.push(
    '## Summary',
  )
  lines.push('')
  lines.push(
    '| Model | Cold load | Recall match% | Recall correct-page% | False positives | Cross-lingual top-1 |',
  )
  lines.push('|---|---:|---:|---:|---:|---:|')
  for (const r of reports) {
    const matchPct = (r.recall.matched / Math.max(1, r.recall.total)) * 100
    const pagePct = (r.recall.correctPage / Math.max(1, r.recall.total)) * 100
    const crossPct =
      (r.crossLingual.top1Correct / Math.max(1, r.crossLingual.total)) * 100
    lines.push(
      `| \`${r.model}\` | ${r.timing.coldLoadMs}ms | ${matchPct.toFixed(1)}% (${r.recall.matched}/${r.recall.total}) | ${pagePct.toFixed(1)}% (${r.recall.correctPage}/${r.recall.total}) | ${r.precision.falsePositives.length}/${r.precision.total} | ${crossPct.toFixed(1)}% (${r.crossLingual.top1Correct}/${r.crossLingual.total}) |`,
    )
  }
  lines.push('')

  lines.push('## Per-model detail')
  for (const r of reports) {
    lines.push('')
    lines.push(`### \`${r.model}\``)
    lines.push('')
    lines.push(
      `- Cold load: **${r.timing.coldLoadMs}ms** · total match time (88 runs): **${r.timing.totalMatchMs}ms** · per-citation avg: **${r.timing.perCitationMs}ms**`,
    )
    lines.push(
      `- Recall: ${r.recall.matched}/${r.recall.total} matched · ${r.recall.correctPage}/${r.recall.total} on correct page · avg confidence ${r.recall.avgConfidence}`,
    )
    lines.push(
      `- Precision: ${r.precision.correctlyRejected}/${r.precision.total} correctly rejected against \`14484.pdf\` · ${r.precision.falsePositives.length} false positives`,
    )
    if (r.precision.falsePositives.length > 0) {
      lines.push('')
      lines.push('  Sample false positives:')
      for (const fp of r.precision.falsePositives.slice(0, 5)) {
        lines.push(
          `  - \`${fp.citationKey}\` → conf ${fp.confidence}, ${fp.reasoning}`,
        )
      }
    }
    lines.push(
      `- Cross-lingual fixture: ${r.crossLingual.top1Correct}/${r.crossLingual.total} top-1 correct · ${r.crossLingual.accepted}/${r.crossLingual.total} accepted as any match`,
    )
    lines.push('')
    lines.push('  Per pair:')
    for (const p of r.crossLingual.perPair) {
      const mark = p.passageStartsWithTarget ? '✓' : p.accepted ? '~' : '✗'
      lines.push(
        `  - ${mark} \`${p.name}\` · accepted=${p.accepted} · conf ${p.confidence} · target-hit=${p.passageStartsWithTarget}`,
      )
    }
  }
  lines.push('')
  return lines.join('\n')
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(REPORT_DIR, { recursive: true })

  console.log('Loading PDFs…')
  const thesisBuf = await readFile(THESIS_PDF)
  const thesisExtract = await extractPdfText(new Uint8Array(thesisBuf))
  const unrelatedBuf = await readFile(UNRELATED_PDF)
  const unrelatedExtract = await extractPdfText(new Uint8Array(unrelatedBuf))

  const thesisAllPages = thesisExtract.pages
  const thesisPages = thesisAllPages.slice(0, MAX_THESIS_PAGES)
  console.log(
    `thesis pages: ${thesisAllPages.length} (using first ${thesisPages.length} for benchmark), unrelated pages: ${unrelatedExtract.pages.length}`,
  )

  const allCitations = groupCitations(
    parseCitationsFromPages(thesisExtract.pages),
  )
  const citations = allCitations.filter((g) => {
    const firstPage = g.occurrences[0]?.thesisPage ?? Number.POSITIVE_INFINITY
    return firstPage <= MAX_THESIS_PAGES
  })
  console.log(
    `unique citations in corpus: ${allCitations.length} total · ${citations.length} on pages 1-${MAX_THESIS_PAGES}`,
  )

  const reports: ModelReport[] = []
  for (const model of MODELS) {
    const r = await runForModel(
      model,
      thesisPages,
      unrelatedExtract.pages,
      citations,
    )
    reports.push(r)
  }

  await writeFile(
    resolve(OUT_DIR, 'embedder-comparison.json'),
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        thesisPdf: 'thesis_example.pdf',
        thesisPagesUsed: thesisPages.length,
        thesisPagesTotal: thesisAllPages.length,
        unrelatedPdf: '14484.pdf',
        crossLingualPairs: CROSS_LINGUAL_FIXTURE.length,
        citationsInCorpus: citations.length,
        citationsTotal: allCitations.length,
        reports,
      },
      null,
      2,
    ),
  )

  const md = renderMarkdown(reports, {
    thesisPagesUsed: thesisPages.length,
    thesisPagesTotal: thesisAllPages.length,
    citationsInCorpus: citations.length,
    citationsTotal: allCitations.length,
  })
  await writeFile(resolve(REPORT_DIR, 'embedder-comparison.md'), md)

  console.log('\nWrote:')
  console.log(`  ${resolve(OUT_DIR, 'embedder-comparison.json')}`)
  console.log(`  ${resolve(REPORT_DIR, 'embedder-comparison.md')}`)
}

await main()
