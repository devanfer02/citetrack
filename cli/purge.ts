#!/usr/bin/env bun
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'

import { db } from '#/db'
import * as schema from '#/db/schema'
import { paths } from '#/lib/paths'

const DICTIONARY_TABLES = new Set(['dictionary', 'dictionary_cache'])
const VOCABULARY_TABLES = new Set(['evaluation_vocabulary'])

function discoverTables(): string[] {
  return Object.values(schema)
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => getTableName(t))
    .toSorted()
}

const UPLOAD_DIRS = [
  paths.userUploads,
  paths.sourceUploads,
  paths.evaluationUploads,
] as const

type ParsedArgs = {
  skipConfirm: boolean
  keepDictionary: boolean
  keepVocabulary: boolean
  help: boolean
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set(argv)
  return {
    skipConfirm: flags.has('--yes') || flags.has('-y'),
    keepDictionary: flags.has('--keep-dictionary'),
    keepVocabulary: flags.has('--keep-vocabulary'),
    help: flags.has('--help') || flags.has('-h'),
  }
}

function printHelp(): void {
  console.log(`Purge CLI — wipes DB tables and upload files.

Usage: bun run cli/purge.ts [flags]

Flags:
  -y, --yes               Skip the interactive confirmation prompt
      --keep-dictionary   Preserve the KBBI dictionary and dictionary_cache tables
      --keep-vocabulary   Preserve the curated evaluation_vocabulary table
  -h, --help              Show this message

Tables to truncate are auto-discovered from src/db/schema.ts.

Danger: this is irreversible. After purging, the KBBI dictionary must be
re-seeded via scripts/load-kbbi.sh unless --keep-dictionary was used.`)
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

async function purgeDir(dir: string): Promise<number> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw err
  }
  for (const entry of entries) {
    await rm(join(dir, entry), { recursive: true, force: true })
  }
  return entries.length
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    return
  }

  const allTables = discoverTables()
  const tablesToTruncate = allTables.filter((t) => {
    if (args.keepDictionary && DICTIONARY_TABLES.has(t)) return false
    if (args.keepVocabulary && VOCABULARY_TABLES.has(t)) return false
    return true
  })
  const preserved = allTables.filter((t) => !tablesToTruncate.includes(t))

  console.log('About to purge:')
  console.log(`  DB tables (${tablesToTruncate.length}):`)
  for (const t of tablesToTruncate) console.log(`    - ${t}`)
  if (preserved.length > 0) {
    console.log(`  Preserved (${preserved.length}):`)
    for (const t of preserved) console.log(`    - ${t}`)
  }
  console.log('  Upload directories (files will be removed, dirs kept):')
  for (const d of UPLOAD_DIRS) console.log(`    - ${d}`)

  if (!args.skipConfirm) {
    const ok = await confirm('\nContinue? This is irreversible. [y/N] ')
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  const tableList = tablesToTruncate.map((t) => `"${t}"`).join(', ')
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`),
  )
  console.log(`✓ Truncated ${tablesToTruncate.length} tables.`)

  let totalDeleted = 0
  for (const dir of UPLOAD_DIRS) {
    const count = await purgeDir(dir)
    totalDeleted += count
    console.log(`✓ Removed ${count} entries from ${dir}`)
  }
  console.log(`\nPurge complete. ${totalDeleted} upload entries removed.`)

  if (!args.keepDictionary) {
    console.log(
      '\nNote: dictionary tables were cleared. Re-seed with scripts/load-kbbi.sh.',
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Purge failed:', err)
    process.exit(1)
  })
