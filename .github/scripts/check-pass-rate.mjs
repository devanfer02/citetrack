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

const passed = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0
const skipped = report.numPendingTests ?? 0
const todo = report.numTodoTests ?? 0
const total = report.numTotalTests ?? 0
const failedSuites = report.numFailedTestSuites ?? 0

const executed = passed + failed

console.log(
  `Tests: ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo (${total} total across ${report.numTotalTestSuites ?? 0} suites)`,
)

if (failedSuites > 0 && executed === 0) {
  console.error(`${failedSuites} test suite(s) errored before any test ran (likely an import or compile error).`)
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
