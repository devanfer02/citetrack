import type { ReactNode } from 'react'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PdfPreview } from '#/components/PdfPreview'

export interface ReviewWithPreviewProps {
  jobId: string
  currentPage: number
  onPageChange: (page: number) => void
  highlight?: string | null
  children: ReactNode
}

export function ReviewWithPreview({
  jobId,
  currentPage,
  onPageChange,
  highlight,
  children,
}: ReviewWithPreviewProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_32.5rem] lg:gap-6">
      {/* Mobile collapsible PDF (hidden on lg+) */}
      <details
        open={mobileOpen}
        onToggle={(e) => setMobileOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="rounded-xl border border-border bg-card lg:hidden"
      >
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-foreground">
          <span>Thesis PDF preview</span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
          />
        </summary>
        {mobileOpen && (
          <div className="h-[60vh] border-t border-border">
            <PdfPreview
              jobId={jobId}
              currentPage={currentPage}
              onPageChange={onPageChange}
              highlight={highlight}
            />
          </div>
        )}
      </details>

      {/* Table (always visible) */}
      <div className="min-w-0 lg:order-first lg:h-[calc(100vh-7rem)] lg:min-h-0">
        {children}
      </div>

      {/* Desktop PDF (hidden on mobile) — fixed viewport-based height */}
      <aside className="hidden lg:block lg:h-[calc(100vh-7rem)] lg:min-h-0">
        <PdfPreview
          jobId={jobId}
          currentPage={currentPage}
          onPageChange={onPageChange}
          highlight={highlight}
        />
      </aside>
    </div>
  )
}
