/** Rate-limit friendly retrying for Vercel API calls (pure; time and waiting are injected so tests don't sleep). */

export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = 6;
const MAX_DELAY_MS = 30_000;

/** Milliseconds to wait before attempt `attempt` (1 = the first retry): the server's own hint when it gave one, else exponential 0.5s, 1s, 2s ... */
export function backoffDelayMs(attempt: number, retryAfterMs?: number | null): number {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, MAX_DELAY_MS);
  return Math.min(500 * 2 ** (attempt - 1), MAX_DELAY_MS);
}

/** `Retry-After` (seconds or a date) or Vercel's `X-RateLimit-Reset` (epoch seconds) → ms from `nowMs`; null when absent. */
export function retryAfterFromHeaders(get: (name: string) => string | null, nowMs: number): number | null {
  const ra = get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, at - nowMs);
  }
  const reset = Number(get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - nowMs);
  return null;
}

/** Runs `attempt` until it returns a non-retryable status (or attempts run out). Never retries a thrown network error more than the same cap. */
export async function withBackoff<T extends { status: number; retryAfterMs?: number | null }>(
  attempt: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let last: T | null = null;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try {
      last = await attempt();
      if (!RETRYABLE_STATUSES.has(last.status)) return last;
    } catch (err) {
      if (n === MAX_ATTEMPTS) throw err;
    }
    if (n < MAX_ATTEMPTS) await sleep(backoffDelayMs(n, last?.retryAfterMs));
  }
  return last as T;
}
