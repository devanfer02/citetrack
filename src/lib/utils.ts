import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return null
  }
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) {
    return seconds < 10
      ? `${seconds.toFixed(1)} dtk`
      : `${Math.round(seconds)} dtk`
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds - minutes * 60)
  if (remainder === 0) return `${minutes} mnt`
  return `${minutes} mnt ${remainder} dtk`
}
