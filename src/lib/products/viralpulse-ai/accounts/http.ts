/**
 * The one place the accounts layer talks to a provider. `fetch` is replaceable so the tests run against fake provider servers and never
 * reach the internet. Errors keep the HTTP status (so a 401 can trigger one refresh-and-retry) and a short provider message, and never the
 * request URL or body: those carry tokens and client secrets.
 */
export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null = null) {
    super(message);
    this.name = "HttpError";
  }
}

type FetchFn = typeof fetch;
let impl: FetchFn | null = null;
/** Tests only. Pass null to restore the real fetch. */
export function setFetchForTests(f: FetchFn | null): void {
  impl = f;
}

export async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const f = impl ?? fetch;
  let res: Response;
  try {
    res = await f(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new HttpError(e instanceof Error && e.name === "TimeoutError" ? "The platform did not answer in time." : "Could not reach the platform.", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = body as { error?: { message?: string; code?: string | number; type?: string } | string; error_description?: string; message?: string; detail?: string; title?: string } | null;
    const obj = typeof b?.error === "object" && b.error ? b.error : null;
    const code = obj ? String(obj.code ?? obj.type ?? "") : typeof b?.error === "string" ? b.error : "";
    const msg = obj?.message || b?.error_description || b?.message || b?.detail || b?.title || (typeof b?.error === "string" ? b.error : "") || `HTTP ${res.status}`;
    throw new HttpError(String(msg).replace(/(access_token|client_secret|refresh_token|code|token)=[^&\s"']+/gi, "$1=[redacted]").slice(0, 300), res.status, code || null);
  }
  return body as T;
}

export const formBody = (o: Record<string, string>): URLSearchParams => new URLSearchParams(o);
export const basicAuth = (id: string, secret: string): string => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;
