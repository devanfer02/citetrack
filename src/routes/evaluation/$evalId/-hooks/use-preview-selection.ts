import { useCallback, useState } from 'react'
import { parseHighlightsParam } from '#/schemas/evaluation'

export interface UsePreviewSelectionResult {
  previewPage: number
  previewHighlight: string | null
  jumpToFinding: (page: number, highlight?: string) => void
  handlePreviewPageChange: (page: number) => void
}

interface UsePreviewSelectionOptions {
  initialHighlightsParam?: string
}

export function usePreviewSelection(
  options: UsePreviewSelectionOptions = {},
): UsePreviewSelectionResult {
  const initial = parseHighlightsParam(options.initialHighlightsParam)
  const [previewPage, setPreviewPage] = useState(initial?.page ?? 1)
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(
    initial?.highlight ?? null,
  )

  const jumpToFinding = useCallback((page: number, highlight?: string) => {
    setPreviewPage(page)
    setPreviewHighlight(highlight ?? null)
  }, [])

  const handlePreviewPageChange = useCallback((page: number) => {
    setPreviewPage(page)
    setPreviewHighlight(null)
  }, [])

  return { previewPage, previewHighlight, jumpToFinding, handlePreviewPageChange }
}
