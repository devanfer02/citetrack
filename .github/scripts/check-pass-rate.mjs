import { readFileSync } from 'node:fs'

const [, , reportPath, thresholdArg] = process.argv

if (!reportPath) {
  console.error('Usage: check-pass-rate.mjs <vitest-json-report> [thresholdPercent]')
  process.exit(2)
}

const threshold = Number(thresholdArg ?? '95')

if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
  console.error(`Invalid threshold "${thresholdArg}". Pass a number between 0 and 100.`)
  process.exit(2)
}

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (error) {
  console.error(`Could not read the vitest report at "${reportPath}": ${error.message}`)
  console.error('The test run probably crashed before writing results. Treating as failure.')
  process.exit(1)
}

if (!report || typeof report !== 'object') {
  console.error(`The vitest report at "${reportPath}" is empty or not a JSON object. Treating as failure.`)
  process.exit(1)
}

const passed = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0
const skipped = report.numPendingTests ?? 0
const todo = report.numTodoTests ?? 0
const total = report.numTotalTests ?? 0

const executed = passed + failed

console.log(
  `Tests: ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo (${total} total across ${report.numTotalTestSuites ?? 0} suites)`,
)

// A suite that fails to compile/import/run never produces assertion results, so its
// tests silently vanish from the denominator instead of counting as failures. Catch
// those per-suite — checking only the run-wide count misses the case where one suite
// errors while others pass.
const erroredSuites = (report.testResults ?? []).filter(
  (suite) => suite.status === 'failed' && (suite.assertionResults?.length ?? 0) === 0,
)

if (erroredSuites.length > 0) {
  console.error(`${erroredSuites.length} test suite(s) failed to compile, import, or run before any test executed:`)
  for (const suite of erroredSuites) {
    console.error(`  - ${suite.name}`)
  }
  process.exit(1)
}

if (executed === 0) {
  console.error('No tests were executed. Treating as failure.')
  process.exit(1)
}

const passRate = (passed / executed) * 100
console.log(`Pass rate (of executed tests): ${passRate.toFixed(2)}% — required: ${threshold}%`)

const epsilon = 1e-9
if (passRate + epsilon < threshold) {
  console.error(`Pass rate ${passRate.toFixed(2)}% is below the ${threshold}% threshold.`)
  process.exit(1)
}

console.log('Pass-rate gate satisfied.')
