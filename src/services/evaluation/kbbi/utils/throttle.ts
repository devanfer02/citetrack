// Re-export for legacy callers. Source of truth is src/lib/http-throttle.ts,
// shared with the autofetch provider chain so both subsystems serialize
// through one in-memory queue per host.
export {
  __resetThrottleForTests,
  hostOf,
  isHostPaused,
  parseRetryAfter,
  pauseHost,
  throttleHost,
} from '#/lib/http-throttle'
