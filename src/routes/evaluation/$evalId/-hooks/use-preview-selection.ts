import { useCallback, useState } from 'react'

export interface UsePreviewSelectionResult {
  previewPage: number
  previewHighlight: string | null
  jumpToFinding: (page: number, highlight?: string) => void
  handlePreviewPageChange: (page: number) => void
}

export function usePreviewSelection(): UsePreviewSelectionResult {
  const [previewPage, setPreviewPage] = useState(1)
  const [previewHighlight, setPreviewHighlight] = useState<string | null>(null)

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
