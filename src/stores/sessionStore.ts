import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Anonymous browser-scoped session ID. In public mode it scopes
// /history to "what this browser created". In local mode it's still
// persisted but the server doesn't filter on it, so existing local
// histories keep working.
interface SessionState {
  sessionId: string
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for very old browsers — RFC 4122 v4.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const useSessionStore = create<SessionState>()(
  persist(
    () => ({
      sessionId: generateSessionId(),
    }),
    {
      name: 'citetrack-session',
      version: 1,
    },
  ),
)

export const getSessionId = (): string => useSessionStore.getState().sessionId
