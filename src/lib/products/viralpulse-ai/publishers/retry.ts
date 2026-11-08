import { ProviderError } from "./errors";

/** Exponential backoff with full jitter: delay in [base*2^n/2, base*2^n], capped; a provider Retry-After wins when longer. */
export function backoffMs(attempt: number, opts: { baseMs?: number; capMs?: number; retryAfterMs?: number | null; rand?: () => number } = {}): number {
  const base = opts.baseMs ?? 30_000;
  const cap = opts.capMs ?? 3 * 60 * 60_000;
  const rand = opts.rand ?? Math.random;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jittered = exp / 2 + rand() * (exp / 2);
  return Math.min(cap, Math.max(Math.round(jittered), opts.retryAfterMs ?? 0));
}

export const MAX_ATTEMPTS = 5;

/** In-process retries for one HTTP call inside a publish (short, bounded; the attempt-level backoff handles the long waits). */
export async function withRetry<T>(fn: (n: number) => Promise<T>, o: { retries?: number; sleep: (ms: number) => Promise<void>; baseMs?: number; maxWaitMs?: number; rand?: () => number }): Promise<T> {
  const retries = o.retries ?? 2;
  for (let n = 0; ; n++) {
    try {
      return await fn(n);
    } catch (e) {
      if (!(e instanceof ProviderError) || !e.retryable || n >= retries) throw e;
      const wait = backoffMs(n + 1, { baseMs: o.baseMs ?? 1000, capMs: 15_000, retryAfterMs: e.retryAfterMs, rand: o.rand });
      if (wait > (o.maxWaitMs ?? 20_000)) throw e; // too long to wait inside a request: leave it to the attempt-level backoff
      await o.sleep(wait);
    }
  }
}
