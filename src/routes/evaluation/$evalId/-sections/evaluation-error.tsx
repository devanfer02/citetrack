export function EvaluationErrorView({ error }: { error: unknown }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-8">
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load evaluation.'}
      </p>
    </main>
  )
}
