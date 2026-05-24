import { env } from '#/env'

// In-process semaphore for limiting concurrent heavy operations (PDF
// extraction, passage-matching batches). Sized from env.MAX_CONCURRENT_JOBS
// so a 2cpu/2gb VPS can stay at 1 while a beefier host can raise it.

class Semaphore {
  private permits: number
  private waiters: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--
      return () => this.release()
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.permits--
    return () => this.release()
  }

  private release(): void {
    this.permits++
    const next = this.waiters.shift()
    if (next) next()
  }

  get queueDepth(): number {
    return this.waiters.length
  }

  get available(): number {
    return this.permits
  }
}

const jobSemaphore = new Semaphore(env.MAX_CONCURRENT_JOBS)

export async function withJobSlot<T>(fn: () => Promise<T>): Promise<T> {
  const release = await jobSemaphore.acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}

export function getJobQueueStats(): { available: number; queued: number } {
  return { available: jobSemaphore.available, queued: jobSemaphore.queueDepth }
}
