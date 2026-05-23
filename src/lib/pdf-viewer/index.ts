import type * as PdfJsNs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

type PdfJs = typeof PdfJsNs

let loaderPromise: Promise<PdfJs> | null = null

export function loadPdfJs(): Promise<PdfJs> {
  if (typeof window === 'undefined') {
    throw new Error('pdf-viewer is client-only')
  }
  if (!loaderPromise) {
    loaderPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(
      async (mod) => {
        const workerUrl = (
          await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
        ).default
        mod.GlobalWorkerOptions.workerSrc = workerUrl
        return mod
      },
    )
  }
  return loaderPromise
}

export type { PDFDocumentProxy, PDFPageProxy }
