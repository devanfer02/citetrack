// Named abort reason for the self-imposed per-word KBBI external-lookup timeout.
// Lives in `lib` (a leaf module) so both `kbbi/lookup` (which aborts with it) and
// `logs/logged-fetch` (which classifies it) can import it without a cycle.
export class LookupTimeoutError extends Error {
  constructor(message = 'external-lookup-timeout') {
    super(message)
    this.name = 'LookupTimeoutError'
  }
}
