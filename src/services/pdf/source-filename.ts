function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveAutoFetchFilename(ref: {
  title?: string | null
  author?: string | null
  year?: string | null
}): string {
  const authorRaw = ref.author ?? ''
  const titleRaw = ref.title ?? ''
  const yearRaw = ref.year ?? ''
  const firstAuthor =
    authorRaw.split(/,|&|\bet al\.?\b|\band\b/i)[0]?.trim() ?? ''
  const authorSlug = slugify(firstAuthor)
  const yearSlug = yearRaw
    .replace(/[^0-9a-zA-Z]/g, '')
    .slice(0, 6)
    .toLowerCase()
  if (authorSlug && yearSlug) return `${authorSlug}-${yearSlug}.pdf`
  if (authorSlug) return `${authorSlug}.pdf`
  if (yearSlug) return `ref-${yearSlug}.pdf`
  const titleSlug = slugify(titleRaw).slice(0, 40)
  return titleSlug ? `${titleSlug}.pdf` : 'sumber.pdf'
}
