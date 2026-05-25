import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileX,
  Loader2,
  Lock,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { loadPdfJs } from '#/lib/pdf-viewer'
import { MAX_SCALE, MIN_SCALE, SCALE_STEP } from '#/lib/pdf-viewer/constants'
import {
  applyHighlight,
  applySearchHighlights,
  inferStatus,
} from '#/lib/pdf-viewer/utils'
import {
  buildPageTextIndex,
  searchIndex,
  type SearchOccurrence,
} from '#/lib/pdf-viewer/search'

export interface PdfPreviewProps {
  jobId: string
  currentPage: number
  onPageChange?: (page: number) => void
  highlight?: string | null
  initialScale?: number
  className?: string
  pdfUrl?: string
}

export function PdfPreview({
  jobId,
  currentPage,
  onPageChange,
  highlight,
  initialScale = 0.75,
  className,
  pdfUrl,
}: PdfPreviewProps) {
  const sourceUrl = pdfUrl ?? `/api/pdf/${jobId}`
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wheelLockRef = useRef(0)
  const [scale, setScale] = useState(initialScale)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeMatchIdx, setActiveMatchIdx] = useState(0)

  const docQuery = useQuery({
    queryKey: ['pdf-doc', sourceUrl],
    queryFn: async () => {
      const pdfjs = await loadPdfJs()
      return pdfjs.getDocument({
        url: sourceUrl,
        verbosity: pdfjs.VerbosityLevel.ERRORS,
      }).promise
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // pdf.js documents own a worker — release it when the data ref swaps or
  // the component unmounts. TanStack Query doesn't provide a resource-cleanup
  // lifecycle, so a cleanup-only effect is the carve-out.
  useEffect(() => {
    const doc = docQuery.data
    return () => {
      doc?.destroy()
    }
  }, [docQuery.data])

  const indexQuery = useQuery({
    queryKey: ['pdf-text-index', sourceUrl, docQuery.dataUpdatedAt],
    queryFn: ({ signal }) => buildPageTextIndex(docQuery.data!, signal),
    enabled: docQuery.data != null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const document = docQuery.data ?? null
  const numPages = docQuery.data?.numPages ?? 0
  const pageIndex = indexQuery.data ?? null
  const status: ViewerStatus = docQuery.isError
    ? inferStatus(docQuery.error)
    : docQuery.data
      ? 'ready'
      : 'loading'

  const matches = useMemo<SearchOccurrence[]>(() => {
    if (!pageIndex || !searchQuery.trim()) return []
    return searchIndex(pageIndex, searchQuery)
  }, [pageIndex, searchQuery])

  // Match navigation is imperative — fold the page-change side-effect into
  // each handler so we don't need a reactive effect tracking activeMatchIdx.
  const navigateToMatch = (list: SearchOccurrence[], idx: number) => {
    if (list.length === 0) return
    const target = list[Math.min(idx, list.length - 1)]
    if (target.pageNumber !== currentPage) onPageChange?.(target.pageNumber)
  }

  // Render the requested page (canvas + text layer) and apply any
  // highlight. One effect so cancelling mid-render tears down everything.
  useEffect(() => {
    if (!document) return
    const canvas = canvasRef.current
    const textLayer = textLayerRef.current
    if (!canvas || !textLayer) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const targetPage = Math.min(Math.max(1, currentPage), numPages)
    let cancelled = false
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null
    let textLayerTask: { cancel(): void } | null = null

    const run = async () => {
      const pdfjs = await loadPdfJs()
      const page = await document.getPage(targetPage)
      if (cancelled) {
        page.cleanup()
        return
      }
      const outputScale = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale })
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const transform =
        outputScale !== 1
          ? ([outputScale, 0, 0, outputScale, 0, 0] as [
              number,
              number,
              number,
              number,
              number,
              number,
            ])
          : null

      renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: transform ?? undefined,
      })
      try {
        await renderTask.promise
      } catch (e) {
        const err = e as PdfJsErrorShape
        if (err?.name !== 'RenderingCancelledException') setStatus('error')
        page.cleanup()
        return
      }
      if (cancelled) {
        page.cleanup()
        return
      }

      // Text layer — overlays the canvas with positioned transparent
      // spans so we can search and highlight text.
      textLayer.replaceChildren()
      textLayer.style.width = `${Math.floor(viewport.width)}px`
      textLayer.style.height = `${Math.floor(viewport.height)}px`
      // Both variable names — older pdfjs used --scale-factor, v5 reads
      // --total-scale-factor inside its text layer CSS. Set both so the
      // spans get a non-zero font-size and visible transform regardless
      // of which the active build expects.
      textLayer.style.setProperty('--scale-factor', String(scale))
      textLayer.style.setProperty('--total-scale-factor', String(scale))

      try {
        const textContent = await page.getTextContent()
        if (cancelled) {
          page.cleanup()
          return
        }
        const layer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
        })
        textLayerTask = layer
        await layer.render()
      } catch {
        // Text layer failure is non-fatal; user just won't get highlight.
      }

      if (cancelled) {
        page.cleanup()
        return
      }

      // Search results take precedence: they're the user's active query.
      // The single-shot highlight from a finding click only applies when
      // no search is running.
      if (searchQuery.trim().length > 0 && matches.length > 0) {
        const currentMatch =
          matches[Math.min(activeMatchIdx, matches.length - 1)]
        const occurrenceOnPage =
          currentMatch.pageNumber === targetPage
            ? currentMatch.occurrenceOnPage
            : -1
        applySearchHighlights(
          textLayer,
          searchQuery,
          occurrenceOnPage,
          scrollRef.current,
        )
      } else if (highlight && highlight.trim().length > 0) {
        applyHighlight(textLayer, highlight, scrollRef.current)
      }

      page.cleanup()
    }

    void run()

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayerTask?.cancel()
    }
  }, [
    document,
    currentPage,
    scale,
    numPages,
    highlight,
    searchQuery,
    matches,
    activeMatchIdx,
  ])

  const clampedPage = Math.min(Math.max(1, currentPage), Math.max(1, numPages))

  const goTo = (page: number, scrollTo?: 'top' | 'bottom') => {
    const next = Math.min(Math.max(1, page), numPages)
    if (next === clampedPage) return
    onPageChange?.(next)
    if (scrollTo && scrollRef.current) {
      const el = scrollRef.current
      requestAnimationFrame(() => {
        el.scrollTop = scrollTo === 'top' ? 0 : el.scrollHeight
      })
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (status !== 'ready') return
    const el = scrollRef.current
    if (!el) return

    const wantsDown = e.deltaY > 0
    const wantsUp = e.deltaY < 0
    const atTop = el.scrollTop <= 0
    const atBottom =
      Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1
    const contentFits = el.scrollHeight <= el.clientHeight

    if (contentFits || (atTop && wantsUp) || (atBottom && wantsDown)) {
      e.preventDefault()
    }

    const now = performance.now()
    if (now - wheelLockRef.current < 350) return

    if (wantsDown && atBottom && clampedPage < numPages) {
      wheelLockRef.current = now
      goTo(clampedPage + 1, 'top')
    } else if (wantsUp && atTop && clampedPage > 1) {
      wheelLockRef.current = now
      goTo(clampedPage - 1, 'bottom')
    }
  }

  const submitSearch = () => {
    if (!pageIndex) return
    const query = searchInput
    const next = query.trim() ? searchIndex(pageIndex, query) : []
    setSearchQuery(query)
    setActiveMatchIdx(0)
    navigateToMatch(next, 0)
  }
  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setActiveMatchIdx(0)
  }
  const matchTotal = matches.length
  const activeMatchDisplay = matchTotal === 0 ? 0 : activeMatchIdx + 1
  const searchReady = pageIndex !== null
  const hasSearchQuery = searchQuery.trim().length > 0

  return (
    // <section aria-label> is already a labeled region; tabIndex + onKeyDown
    // wire keyboard arrow-key page navigation. The a11y linter contradicts
    // itself here — prefer-tag-over-role wants <section>, but
    // no-noninteractive-* rejects handlers on <section>. Disable the two
    // interactivity rules locally: this is the documented ARIA pattern.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
    <section tabIndex={0} aria-label="PDF preview"
      onKeyDown={(e) => {
        if (status !== 'ready') return
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          goTo(clampedPage - 1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          goTo(clampedPage + 1)
        }
      }}
      className={`flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 ${className ?? ''}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Previous page"
            onClick={() => goTo(clampedPage - 1)}
            disabled={status !== 'ready' || clampedPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="number"
              min={1}
              max={Math.max(numPages, 1)}
              value={clampedPage}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10)
                if (Number.isFinite(v)) goTo(v)
              }}
              disabled={status !== 'ready'}
              className="h-7 w-12 rounded-md border border-border bg-background px-1.5 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              aria-label="Page number"
            />
            <span>/ {numPages || '—'}</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Next page"
            onClick={() => goTo(clampedPage + 1)}
            disabled={status !== 'ready' || clampedPage >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitSearch()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  clearSearch()
                }
              }}
              placeholder={searchReady ? 'Cari di PDF…' : 'Memuat indeks…'}
              disabled={status !== 'ready' || !searchReady}
              aria-label="Search in PDF"
              className="h-7 w-40 rounded-md border border-border bg-background pl-7 pr-7 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {hasSearchQuery && (
            <>
              <span className="kicker min-w-14 text-center text-[0.6875rem] tabular-nums text-muted-foreground">
                {matchTotal === 0
                  ? 'tidak ada'
                  : `${activeMatchDisplay}/${matchTotal}`}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Previous match"
                onClick={() => {
                  if (matchTotal === 0) return
                  const next = (activeMatchIdx - 1 + matchTotal) % matchTotal
                  setActiveMatchIdx(next)
                  navigateToMatch(matches, next)
                }}
                disabled={matchTotal === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Next match"
                onClick={() => {
                  if (matchTotal === 0) return
                  const next = (activeMatchIdx + 1) % matchTotal
                  setActiveMatchIdx(next)
                  navigateToMatch(matches, next)
                }}
                disabled={matchTotal === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() =>
              setScale((s) => Math.max(MIN_SCALE, Math.round((s - SCALE_STEP) * 100) / 100))
            }
            disabled={status !== 'ready' || scale <= MIN_SCALE}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-10 text-center text-xs text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() =>
              setScale((s) => Math.min(MAX_SCALE, Math.round((s + SCALE_STEP) * 100) / 100))
            }
            disabled={status !== 'ready' || scale >= MAX_SCALE}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Canvas / status panel */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="relative flex-1 overflow-auto overscroll-contain bg-muted/30 p-3"
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">Loading preview…</p>
          </div>
        )}
        {status === 'not-found' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <FileX className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              The thesis PDF is no longer available
            </p>
            <p className="text-xs text-muted-foreground">
              Re-upload the thesis to continue reviewing with the viewer.
            </p>
          </div>
        )}
        {status === 'password' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              This PDF is password protected and cannot be previewed.
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-foreground">
              Something went wrong loading the preview.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void docQuery.refetch()
              }}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="flex justify-center">
          <div className={`relative ${status === 'ready' ? '' : 'invisible'}`}>
            <canvas
              ref={canvasRef}
              className="block shadow-sm"
              aria-label="Halaman PDF"
            />
            <div ref={textLayerRef} className="pdf-text-layer" />
          </div>
        </div>
      </div>
    </section>
  )
}
