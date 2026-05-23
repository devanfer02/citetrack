export const isInRanges = (
  offset: number,
  ranges: Array<[number, number]>,
): boolean => {
  for (const [s, e] of ranges) {
    if (offset >= s && offset < e) return true
  }
  return false
}

export const overlapsRanges = (
  offset: number,
  length: number,
  ranges: Array<[number, number]>,
): boolean => {
  const end = offset + length
  for (const [s, e] of ranges) {
    if (offset < e && end > s) return true
  }
  return false
}
