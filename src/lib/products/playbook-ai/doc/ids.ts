/** Block id generation. Pure and client-safe: uses the Web Crypto `randomUUID` that both browsers (secure contexts) and Node provide. */
export type IdFactory = () => string;

export const randomId: IdFactory = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Only reached in a non-secure browser context: still unique enough for block ids (never used for security).
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/** Deterministic ids for tests and golden fixtures: `n1`, `n2`, ... */
export function sequentialIds(prefix = "n"): IdFactory {
  let i = 0;
  return () => `${prefix}${++i}`;
}
