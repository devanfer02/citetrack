import { useCallback, useState } from 'react'

type OpenMap = Record<EvaluationCategory, boolean>

export interface UseCategoryFocusResult {
  openCategories: OpenMap
  setCategoryOpen: (category: EvaluationCategory, next: boolean) => void
  highlightedCategory: EvaluationCategory | null
  focusCategory: (category: EvaluationCategory) => void
  clearHighlight: () => void
}

export function useCategoryFocus(): UseCategoryFocusResult {
  const [openCategories, setOpenCategories] = useState<OpenMap>({
    kbbi: true,
    eyd: true,
  })
  const [highlightedCategory, setHighlightedCategory] =
    useState<EvaluationCategory | null>(null)

  const setCategoryOpen = useCallback(
    (category: EvaluationCategory, next: boolean) => {
      setOpenCategories((s) => ({ ...s, [category]: next }))
    },
    [],
  )

  const focusCategory = useCallback((category: EvaluationCategory) => {
    setOpenCategories((s) => ({ ...s, [category]: true }))
    setHighlightedCategory(category)
    requestAnimationFrame(() => {
      document
        .getElementById(`category-${category}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const clearHighlight = useCallback(() => setHighlightedCategory(null), [])

  return {
    openCategories,
    setCategoryOpen,
    highlightedCategory,
    focusCategory,
    clearHighlight,
  }
}
