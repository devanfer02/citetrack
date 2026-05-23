interface ParsedReference {
  author: string
  year: string
  title: string
  doi: string | null
  url: string | null
  publisher: string | null
  journal: string | null
  rawText: string
  startPage: number | null
}

interface ReferenceSection {
  startPage: number
  text: string
}
