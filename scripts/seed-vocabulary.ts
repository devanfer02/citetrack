#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { db } from '#/db'
import { evaluationVocabulary } from '#/db/schema'
import { VOCAB_CLASSIFICATIONS, type VocabClassification } from '#/services/evaluation/vocabulary'

const SEED_PATH = resolve(process.cwd(), 'data/seed/evaluation-vocabulary.tsv')

const isClassification = (value: string): value is VocabClassification =>
  (VOCAB_CLASSIFICATIONS as readonly string[]).includes(value)

const main = async (): Promise<void> => {
  const text = await readFile(SEED_PATH, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
  const header = lines.shift()
  if (header?.split('\t')[0] !== 'word') {
    throw new Error('seed file must start with header: word\\tclassification\\tnotes')
  }

  type Row = typeof evaluationVocabulary.$inferInsert
  const rows: Row[] = []
  for (const line of lines) {
    const [word, classification, notes] = line.split('\t')
    if (!word || !classification) continue
    const normalized = word.toLowerCase().trim()
    if (!isClassification(classification)) {
      console.warn(`skipping ${normalized}: invalid classification "${classification}"`)
      continue
    }
    rows.push({ word: normalized, classification, notes: notes?.trim() || null })
  }

  let inserted = 0
  for (const row of rows) {
    const result = await db
      .insert(evaluationVocabulary)
      .values(row)
      .onConflictDoUpdate({
        target: evaluationVocabulary.word,
        set: { classification: row.classification, notes: row.notes },
      })
      .returning({ word: evaluationVocabulary.word })
    if (result.length === 0) continue
    inserted++
  }

  process.stdout.write(`seeded ${rows.length} entries (${inserted} inserted/updated)\n`)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`)
  process.exit(1)
})
