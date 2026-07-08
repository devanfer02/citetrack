import { create } from 'zustand'

// Live-region announcer store. The accompanying <LiveAnnouncer /> in
// __root.tsx renders two visually-hidden divs (polite + assertive)
// whose text content is driven by this store. Any feature that needs
// to tell a screen-reader user about a state change — filter result
// counts, bulk action outcomes, copy-link feedback, phase transitions
// — calls `useAnnounce()(...)` instead of inventing its own aria-live.
//
// Why a key counter: ARIA live regions only fire when their text
// changes. Back-to-back identical announcements ("12 temuan dipilih"
// after each click on the bulk button) need a fresh DOM node to be
// announced again. We bump the key so React re-mounts the node.

type Politeness = 'polite' | 'assertive'

interface AnnouncerState {
  politeMessage: string
  assertiveMessage: string
  politeKey: number
  assertiveKey: number
  announce: (message: string, politeness?: Politeness) => void
}

export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  politeMessage: '',
  assertiveMessage: '',
  politeKey: 0,
  assertiveKey: 0,
  announce: (message, politeness = 'polite') => {
    const trimmed = message.trim()
    if (!trimmed) return
    if (politeness === 'assertive') {
      set((s) => ({
        assertiveMessage: trimmed,
        assertiveKey: s.assertiveKey + 1,
      }))
    } else {
      set((s) => ({
        politeMessage: trimmed,
        politeKey: s.politeKey + 1,
      }))
    }
  },
}))

// Convenience hook — selects only the stable `announce` action so
// callers don't re-render when an announcement is fired elsewhere.
export function useAnnounce() {
  return useAnnouncerStore((s) => s.announce)
}
