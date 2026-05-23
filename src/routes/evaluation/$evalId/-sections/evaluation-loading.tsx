export function EvaluationLoadingView() {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-5 px-4 pb-8 pt-8">
      <div
        aria-hidden
        className="doc-scan relative w-full max-w-xs overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-6 py-5 shadow-sm"
      >
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-5/6 rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-4/6 rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-full rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-3/4 rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-5/6 rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-2/3 rounded-full bg-muted-foreground/15" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Reading your thesis…
      </p>
    </main>
  )
}
