import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import Typo from 'typo-js'

const INDONESIAN_WHITELIST = new Set([
  'a', 'i', 'o', 'pada', 'dan', 'atau', 'juga', 'ini', 'itu', 'tidak',
  'dari', 'di', 'ke', 'yang', 'untuk', 'dengan', 'oleh', 'dalam', 'akan',
  'bisa', 'dapat', 'ada', 'tak', 'ya', 'no',
  'luring', 'daring', 'agar', 'lama',
])

// Resolve typo-js's bundled dictionary via the package itself rather than
// letting Typo derive a path from its own __dirname. After Nitro bundles
// the server into .output/server, that derivation lands at
// /app/.output/server/_libs/dictionaries/en_US/* which doesn't exist.
// createRequire walks up to node_modules from anywhere.
const TYPO_PKG_DIR = path.dirname(
  createRequire(import.meta.url).resolve('typo-js/package.json'),
)
const AFF_PATH = path.join(TYPO_PKG_DIR, 'dictionaries/en_US/en_US.aff')
const DIC_PATH = path.join(TYPO_PKG_DIR, 'dictionaries/en_US/en_US.dic')

let dictionary: Typo | null = null

const ensureDictionary = (): Typo => {
  if (dictionary) return dictionary
  const affData = readFileSync(AFF_PATH, 'utf-8')
  const dicData = readFileSync(DIC_PATH, 'utf-8')
  dictionary = new Typo('en_US', affData, dicData)
  return dictionary
}

export async function isEnglishWord(raw: string): Promise<boolean> {
  const word = raw.toLowerCase().trim()
  if (!word || word.length < 3) return false
  if (INDONESIAN_WHITELIST.has(word)) return false
  return ensureDictionary().check(word)
}
