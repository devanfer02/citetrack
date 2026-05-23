#!/usr/bin/env bun
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const ITER_ROOT = resolve(process.cwd(), 'docs/train/iterations')

type Finding = {
  pageNumber: number
  offset: number
  ruleId?: string
  token?: string
  message?: string
}

const keyOf = (f: Finding): string =>
  `${f.pageNumber}:${f.offset}:${f.ruleId ?? ''}:${f.token ?? ''}`

const load = async (iter: string, label: string, kind: string): Promise<Finding[]> => {
  try {
    const buf = await readFile(resolve(ITER_ROOT, iter, `${label}-${kind}.json`), 'utf8')
    return JSON.parse(buf) as Finding[]
  } catch {
    return []
  }
}

const diff = (a: Finding[], b: Finding[]): { added: Finding[]; removed: Finding[] } => {
  const aKeys = new Map(a.map((f) => [keyOf(f), f]))
  const bKeys = new Map(b.map((f) => [keyOf(f), f]))
  const added: Finding[] = []
  const removed: Finding[] = []
  for (const [k, f] of bKeys) if (!aKeys.has(k)) added.push(f)
  for (const [k, f] of aKeys) if (!bKeys.has(k)) removed.push(f)
  return { added, removed }
}

const main = async (): Promise<void> => {
  const entries = (await readdir(ITER_ROOT)).filter((n) => /^iter-\d+$/.test(n)).toSorted()
  if (entries.length < 2) {
    console.log('Need at least 2 iterations to diff.')
    process.exit(0)
  }
  const prev = process.argv[2] ?? entries[entries.length - 2]
  const curr = process.argv[3] ?? entries[entries.length - 1]

  console.log(`Comparing ${prev} → ${curr}\n`)

  for (const label of ['thesis', 'journal']) {
    for (const kind of ['eyd', 'kbbi']) {
      const a = await load(prev, label, kind)
      const b = await load(curr, label, kind)
      const { added, removed } = diff(a, b)
      console.log(`\n=== ${label} ${kind}: ${a.length} → ${b.length}  (+${added.length}, -${removed.length}) ===`)
      if (added.length) {
        console.log('+ added (first 10):')
        for (const f of added.slice(0, 10)) {
          console.log(`  + p${f.pageNumber} o${f.offset} ${f.ruleId ?? ''} ${f.token ?? ''} ${(f.message ?? '').slice(0, 60)}`)
        }
      }
      if (removed.length) {
        console.log('- removed (first 10):')
        for (const f of removed.slice(0, 10)) {
          console.log(`  - p${f.pageNumber} o${f.offset} ${f.ruleId ?? ''} ${f.token ?? ''} ${(f.message ?? '').slice(0, 60)}`)
        }
      }
    }
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
