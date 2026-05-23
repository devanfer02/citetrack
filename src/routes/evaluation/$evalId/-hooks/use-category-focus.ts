import { startTransition, useCallback, useState } from 'react'

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

  // Wrap the toggle in a transition so React can interrupt the heavy
  // re-render of the findings list (146+ items) instead of blocking the
  // click. The chevron + button still feel instant; the panel work
  // happens at a lower priority.
  const setCategoryOpen = useCallback(
    (category: EvaluationCategory, next: boolean) => {
      startTransition(() => {
        setOpenCategories((s) => ({ ...s, [category]: next }))
      })
    },
    [],
  )

  const focusCategory = useCallback((category: EvaluationCategory) => {
    startTransition(() => {
      setOpenCategories((s) => ({ ...s, [category]: true }))
    })
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
