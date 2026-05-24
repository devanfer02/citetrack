import {
  getDictWords,
  warmDictStore,
} from '#/services/evaluation/kbbi/dict-store'

type BKNode = {
  word: string
  children: Map<number, BKNode>
}

const createNode = (word: string): BKNode => ({
  word,
  children: new Map(),
})

const levenshtein = (a: string, b: string, cap: number): number => {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > cap) return cap + 1
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from<number>({ length: n + 1 })
  let curr = Array.from<number>({ length: n + 1 })
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      const del = prev[j] + 1
      const ins = curr[j - 1] + 1
      const sub = prev[j - 1] + cost
      const v = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > cap) return cap + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

const distance = (a: string, b: string): number =>
  levenshtein(a, b, Math.max(a.length, b.length))

const insert = (root: BKNode, word: string): void => {
  let node = root
  while (true) {
    const d = distance(word, node.word)
    if (d === 0) return
    const child = node.children.get(d)
    if (!child) {
      node.children.set(d, createNode(word))
      return
    }
    node = child
  }
}

type QueryHit = { word: string; dist: number }

const query = (
  root: BKNode,
  target: string,
  maxDist: number,
): QueryHit | null => {
  let best: QueryHit | null = null
  let bestCap = maxDist
  const stack: BKNode[] = [root]
  while (stack.length) {
    const node = stack.pop() as BKNode
    const d = levenshtein(target, node.word, bestCap)
    if (d <= bestCap) {
      best = { word: node.word, dist: d }
      bestCap = d
      if (d === 1) break
    }
    const lo = d - maxDist
    const hi = d + maxDist
    for (const [k, child] of node.children) {
      if (k >= lo && k <= hi) stack.push(child)
    }
  }
  return best
}

type TreeIndex = Map<string, BKNode>

let cachedTrees: TreeIndex | null = null
let cachedBuckets: Map<string, string[]> | null = null

const buildTrees = (words: string[]): TreeIndex => {
  const trees: TreeIndex = new Map()
  for (const w of words) {
    const first = w[0]
    if (!first) continue
    let root = trees.get(first)
    if (!root) {
      root = createNode(w)
      trees.set(first, root)
      continue
    }
    insert(root, w)
  }
  return trees
}

const buildBuckets = (words: string[]): Map<string, string[]> => {
  const buckets = new Map<string, string[]>()
  for (const w of words) {
    const first = w[0]
    if (!first) continue
    const bucket = buckets.get(first) ?? []
    bucket.push(w)
    buckets.set(first, bucket)
  }
  return buckets
}

async function loadTrees(): Promise<TreeIndex> {
  if (cachedTrees) return cachedTrees
  await warmDictStore()
  const words = getDictWords() ?? []
  cachedTrees = buildTrees(words)
  return cachedTrees
}

export async function loadDictBuckets(): Promise<Map<string, string[]>> {
  await loadTrees()
  if (cachedBuckets) return cachedBuckets
  const words = getDictWords() ?? []
  cachedBuckets = buildBuckets(words)
  return cachedBuckets
}

export function suggestKbbiWord(
  word: string,
  _legacyBuckets?: Map<string, string[]>,
): string | null {
  const w = word.toLowerCase().trim()
  if (w.length < 3 || w.length > 20) return null
  const trees = cachedTrees
  if (!trees) return null
  const root = trees.get(w[0] ?? '')
  if (!root) return null
  const maxDistance = w.length <= 5 ? 1 : 2
  const hit = query(root, w, maxDistance)
  return hit ? hit.word : null
}

export async function ensureSuggesterReady(): Promise<void> {
  await loadTrees()
}

export function kbbiUrlFor(word: string): string {
  return `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(
    word.toLowerCase().trim(),
  )}`
}

export function __resetSuggesterForTests(): void {
  cachedTrees = null
  cachedBuckets = null
}
