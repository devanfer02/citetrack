import type { Finding } from '#/services/evaluation/apply/types'

let nextId = 1

// Minimal finding factory for apply tests. Override only the fields a test
// cares about; everything else gets a harmless default.
export function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? nextId++,
    evalJobId: 'job-1',
    category: 'eyd',
    severity: 'warning',
    pageNumber: 1,
    offset: null,
    length: null,
    excerpt: null,
    token: null,
    message: 'pesan',
    suggestion: null,
    ruleId: 'eyd.test',
    verificationSource: null,
    resolvedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}
