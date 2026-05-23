export const normalizeText = (text: string): string =>
  text
    .replace(/\u00b7/g, '.')
    .replace(/&#183;/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
