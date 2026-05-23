import type * as PdfFinder from '#/schemas/pdf-finder'
import type * as Job from '#/schemas/job'
import type * as Evaluation from '#/schemas/evaluation'
import type * as Pipeline from '#/schemas/pipelineSearch'
import type * as History from '#/schemas/history'

declare global {
  type FetchSource = PdfFinder.FetchSource
  type PdfFindResult = PdfFinder.PdfFindResult
  type JobIdInput = Job.JobIdInput
  type EvalJobIdInput = Evaluation.EvalJobIdInput
  type PipelineSearch = Pipeline.PipelineSearch
  type HistoryKind = History.HistoryKind
  type HistorySearch = History.HistorySearch
  type HistoryQuery = History.HistoryQuery
}
