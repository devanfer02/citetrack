import type * as EvalReport from '#/services/evaluation/report'
import type { LucideIcon } from 'lucide-react'

declare global {
  type EvaluationCategory = 'kbbi' | 'eyd'
  type EvaluationFinding = EvalReport.EvaluationReport['findings'][number]
  type EvaluationJob = EvalReport.EvaluationReport['job']
  interface EvaluationStage {
    id: 'extract' | 'kbbi' | 'eyd'
    label: string
    description: string
    icon: LucideIcon
  }
}
