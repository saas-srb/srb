/**
 * A fast in-process sliding-window counter for the first line of defence (floods, scrapers). Each server instance counts for itself, so
 * this is a brake on abuse, not an exact quota — the database-backed `rateLimit` (rate-limit.ts) is used where an exact, shared count matters
 * (sign-in, public forms, payments). Entries expire on their own and the map is pruned so it can never grow without bound.
 */
interface Slot { n: number; resetAt: number }
const g = globalThis as unknown as { __memLimit?: Map<string, Slot>; __memLimitPrune?: number };
const slots = (g.__memLimit ??= new Map<string, Slot>());
const MAX_KEYS = 50_000;

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (now - (g.__memLimitPrune ?? 0) > 30_000 || slots.size > MAX_KEYS) {
    g.__memLimitPrune = now;
    for (const [k, s] of slots) if (s.resetAt <= now) slots.delete(k);
    if (slots.size > MAX_KEYS) for (const k of [...slots.keys()].slice(0, slots.size - MAX_KEYS / 2)) slots.delete(k);
  }
  const cur = slots.get(key);
  if (!cur || cur.resetAt <= now) {
    slots.set(key, { n: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  cur.n++;
  return cur.n > limit ? { ok: false, retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) } : { ok: true, retryAfter: 0 };
}

// ── Temporary bans (scanners that probe for /.env, /wp-login.php …) ──────────────────────────────────────────────────────────────────
const bans = ((globalThis as unknown as { __bans?: Map<string, number> }).__bans ??= new Map<string, number>());
export function ban(ip: string, minutes: number) {
  bans.set(ip, Date.now() + minutes * 60_000);
  if (bans.size > 20_000) for (const [k, t] of bans) if (t <= Date.now()) bans.delete(k);
}
export function isBanned(ip: string): boolean {
  const t = bans.get(ip);
  if (!t) return false;
  if (t <= Date.now()) { bans.delete(ip); return false; }
  return true;
}
