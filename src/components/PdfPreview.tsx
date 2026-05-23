import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileX,
  Loader2,
  Lock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { loadPdfJs, type PDFDocumentProxy } from '#/lib/pdf-viewer'
import { MAX_SCALE, MIN_SCALE, SCALE_STEP } from '#/lib/pdf-viewer/constants'
import { applyHighlight, inferStatus } from '#/lib/pdf-viewer/utils'

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
  initialScale = 1.0,
  className,
  pdfUrl,
}: PdfPreviewProps) {
  const sourceUrl = pdfUrl ?? `/api/pdf/${jobId}`
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wheelLockRef = useRef(0)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState<ViewerStatus>('loading')
  const [scale, setScale] = useState(initialScale)
  const [reloadToken, setReloadToken] = useState(0)

  // Load document whenever the jobId or reload token changes.
  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setStatus('loading')
    setDocument(null)
    setNumPages(0)

    loadPdfJs()
      .then((pdfjs) => pdfjs.getDocument(sourceUrl).promise)
      .then((doc) => {
        if (cancelled) {
          doc.destroy()
          return
        }
        loaded = doc
        setDocument(doc)
        setNumPages(doc.numPages)
        setStatus('ready')
      })
      .catch((err) => {
        if (!cancelled) setStatus(inferStatus(err))
      })

    return () => {
      cancelled = true
      loaded?.destroy()
    }
  }, [sourceUrl, reloadToken])

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
      textLayer.style.setProperty('--scale-factor', String(scale))

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

      if (highlight && highlight.trim().length > 0) {
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
  }, [document, currentPage, scale, numPages, highlight])

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

  return (
    <section
      tabIndex={0}
      aria-label="PDF preview"
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
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
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
              onClick={() => setReloadToken((t) => t + 1)}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="flex justify-center">
          <div className={`relative ${status === 'ready' ? '' : 'invisible'}`}>
            <canvas ref={canvasRef} className="block shadow-sm" />
            <div ref={textLayerRef} className="pdf-text-layer" />
          </div>
        </div>
      </div>
    </section>
  )
}
