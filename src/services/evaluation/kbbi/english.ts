import Typo from 'typo-js'

const INDONESIAN_WHITELIST = new Set([
  'a', 'i', 'o', 'pada', 'dan', 'atau', 'juga', 'ini', 'itu', 'tidak',
  'dari', 'di', 'ke', 'yang', 'untuk', 'dengan', 'oleh', 'dalam', 'akan',
  'bisa', 'dapat', 'ada', 'tak', 'ya', 'no',
])

let dictionary: Typo | null = null

const ensureDictionary = (): Typo => {
  if (dictionary) return dictionary
  dictionary = new Typo('en_US')
  return dictionary
}

export async function isEnglishWord(raw: string): Promise<boolean> {
  const word = raw.toLowerCase().trim()
  if (!word || word.length < 3) return false
  if (INDONESIAN_WHITELIST.has(word)) return false
  return ensureDictionary().check(word)
}
