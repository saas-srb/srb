import "server-only";

/**
 * Request-body hardening for PUBLIC endpoints. Legitimate payloads never carry MongoDB operators, so any key that
 * starts with `$` (or contains `.`, which addresses nested fields) is rejected outright — closing NoSQL-operator
 * injection (`{"email": {"$ne": null}}`, `{"$where": …}`) before a value can reach a query. Also caps the body size.
 */
export class UnsafeBodyError extends Error {}

function check(value: unknown, depth: number): void {
  if (depth > 12) throw new UnsafeBodyError("Request is too deeply nested.");
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new UnsafeBodyError("Request has too many items.");
    for (const v of value) check(v, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor" || k === "prototype") throw new UnsafeBodyError("Invalid field in request.");
      check(v, depth + 1);
    }
  }
}

/** Deep-validates an already-parsed JSON value. */
export function assertSafeJson<T>(value: T): T {
  check(value, 0);
  return value;
}

/** Reads and validates a JSON request body (default cap 256 KB). Throws `UnsafeBodyError` for anything unsafe or unparsable. */
export async function readSafeJson(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new UnsafeBodyError("Request is too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new UnsafeBodyError("Request is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UnsafeBodyError("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new UnsafeBodyError("Invalid request body.");
  return assertSafeJson(parsed as Record<string, unknown>);
}
