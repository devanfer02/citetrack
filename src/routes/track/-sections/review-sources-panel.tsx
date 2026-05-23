import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { SourceFetchResults } from '#/components/SourceFetchResults'

interface ReviewSourcesPanelProps {
  sources: {
    sourceResults: SourceFetchResult[]
    found: number
    failed: number
    total: number
  }
  passageMatchingDisabled: boolean
  onBack: () => void
  onReset: () => void
  onMatchPassages: () => void
}

export function ReviewSourcesPanel({
  sources,
  passageMatchingDisabled,
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
      {passageMatchingDisabled && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Passage matching is turned off</AlertTitle>
          <AlertDescription>
            The next step uses Claude to find the exact passage each citation
            refers to inside its source PDF. To enable it, open{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
              .env.local
            </code>
            , set{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
              MATCHER_STRATEGY
            </code>{' '}
            to{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
              api
            </code>{' '}
            or{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
              agent
            </code>
            , add an{' '}
            <code className="rounded bg-[var(--chip-bg)] px-1 py-0.5 text-xs">
              ANTHROPIC_API_KEY
            </code>
            , then restart the dev server.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            ← Back to Matching
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Analyze another thesis
          </Button>
        </div>
        <Button
          onClick={onMatchPassages}
          disabled={passageMatchingDisabled}
          title={
            passageMatchingDisabled
              ? 'Set MATCHER_STRATEGY in .env.local to enable'
              : undefined
          }
        >
          Find Passages with AI →
        </Button>
      </div>
    </div>
  )
}
