import type { evaluationFindings } from '#/db/schema'

export type Finding = typeof evaluationFindings.$inferSelect

// One finding that was successfully turned into a text edit.
export type AppliedEdit = {
  findingId: number
  pageNumber: number | null
  category: Finding['category']
  ruleId: string | null
  before: string
  after: string
}

// A selected finding we chose not to apply, with the reason. We never guess a
// location — if the token can't be found in the target document, it lands here
// instead of being applied somewhere wrong.
export type UnlocatedEdit = {
  findingId: number
  pageNumber: number | null
  ruleId: string | null
  token: string
  suggestion: string
  reason: string
}

export type ChangeLog = {
  applied: AppliedEdit[]
  unlocated: UnlocatedEdit[]
}

export type ApplyMode = 'rebuild' | 'patch'
