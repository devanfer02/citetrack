import { useAnnouncerStore } from '#/stores/announcer'

// App-wide live-region pair. Mount once at the shell. Callers anywhere
// in the tree dispatch announcements via useAnnounce() — see
// src/stores/announcer.ts for the rationale and the key-bump pattern.
//
// Polite region: most status updates (filter counts, action outcomes,
//   phase transitions, copy-link confirmations).
// Assertive region: only when the user must hear it immediately —
//   submission errors that block flow, destructive-action results.
export function LiveAnnouncer() {
  const politeMessage = useAnnouncerStore((s) => s.politeMessage)
  const politeKey = useAnnouncerStore((s) => s.politeKey)
  const assertiveMessage = useAnnouncerStore((s) => s.assertiveMessage)
  const assertiveKey = useAnnouncerStore((s) => s.assertiveKey)

  return (
    <>
      <div
        key={`polite-${politeKey}`}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        key={`assertive-${assertiveKey}`}
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </>
  )
}
