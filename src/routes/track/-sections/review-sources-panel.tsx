import { Button } from '#/components/ui/button'
import { SourceFetchResults } from '#/components/SourceFetchResults'

interface ReviewSourcesPanelProps {
  sources: {
    sourceResults: SourceFetchResult[]
    found: number
    failed: number
    total: number
  }
  onBack: () => void
  onReset: () => void
  onMatchPassages: () => void
}

export function ReviewSourcesPanel({
  sources,
  onBack,
  onReset,
  onMatchPassages,
}: ReviewSourcesPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Found {sources.found} of {sources.total} source PDFs.
        {sources.failed > 0 && ` ${sources.failed} could not be found.`}
      </p>
      <SourceFetchResults
        results={sources.sourceResults}
        found={sources.found}
        failed={sources.failed}
        total={sources.total}
      />
      <div className="flex justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            ← Back to Matching
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Analyze another thesis
          </Button>
        </div>
        <Button onClick={onMatchPassages}>
          Find Passages →
        </Button>
      </div>
    </div>
  )
}
