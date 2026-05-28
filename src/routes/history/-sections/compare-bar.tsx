import { Button } from '#/components/ui/button'

export function CompareBar({
  count,
  onReset,
  onCompare,
}: {
  count: number
  onReset: () => void
  onCompare: () => void
}) {
  if (count === 0) return null
  return (
    <section
      aria-label="Perbandingan evaluation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ink)]/10 bg-[var(--bg-cream)]/95 px-6 py-3 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <span
          aria-live="polite"
          aria-atomic="true"
          className="text-[0.875rem] text-[var(--ink)]"
        >
          {count === 1
            ? 'Pilih satu lagi untuk membandingkan.'
            : 'Dua evaluation dipilih.'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onReset}>
            Batal
          </Button>
          <Button
            variant="default"
            disabled={count !== 2}
            onClick={onCompare}
          >
            Bandingkan dipilih
          </Button>
        </div>
      </div>
    </section>
  )
}
