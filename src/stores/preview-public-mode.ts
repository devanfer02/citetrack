import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { env } from '#/env'

// Dev-only toggle that simulates PUBLIC_MODE in the browser without
// touching the real env var. Server fns gated by assertLocalOnly()
// keep using env.PUBLIC_MODE — the toggle only flips client-side UI
// (Header nav, demo badge, privacy callout). Persisted in localStorage
// so the choice survives a reload.

interface PreviewPublicModeState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const usePreviewPublicMode = create<PreviewPublicModeState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'citetrack:preview-public-mode',
    },
  ),
)

// True when the app should render its local-only UI (History/Settings
// nav items, no demo badge, no privacy callout). Combines the real env
// flag with the dev-only preview toggle. SSR returns the env-only
// answer; once the client hydrates, the persisted preview state
// applies.
export function useIsLocalEnv(): boolean {
  const previewEnabled = usePreviewPublicMode((s) => s.enabled)
  if (env.VITE_PUBLIC_MODE) return false
  return !previewEnabled
}

export const isDevEnv = env.VITE_APP_ENV === 'local'
