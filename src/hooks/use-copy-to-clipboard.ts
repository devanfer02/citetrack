import { useState } from 'react'

export function useCopyToClipboard(resetMs = 1500): {
  copied: boolean
  copy: (text: string) => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
      return true
    } catch {
      setCopied(false)
      return false
    }
  }

  return { copied, copy }
}
