import type { ErrorClass } from "./types";

/** A provider failure, already classified and written in plain language. */
export class ProviderError extends Error {
  readonly klass: ErrorClass;
  readonly status: number | null;
  readonly code: string | null;
  readonly hint: string;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;
  constructor(o: { klass: ErrorClass; message: string; hint: string; status?: number | null; code?: string | null; retryAfterMs?: number | null; requestId?: string | null }) {
    super(redact(o.message));
    this.name = "ProviderError";
    this.klass = o.klass;
    this.status = o.status ?? null;
    this.code = o.code ?? null;
    this.hint = o.hint;
    this.retryAfterMs = o.retryAfterMs ?? null;
    this.requestId = o.requestId ?? null;
  }
  get retryable(): boolean {
    return this.klass === "transient" || this.klass === "rate_limit";
  }
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(access_token|client_secret|refresh_token|fb_exchange_token|code_verifier)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/("(?:access_token|refresh_token|client_secret|token|uploadToken)"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2"],
  [/(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]"],
  [/\b(EAA[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9._-]{20,})\b/g, "[redacted]"],
];

/** Removes tokens and secrets from any string before it is logged, stored or shown. */
export function redact(s: string): string {
  let out = s;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function parseRetryAfter(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1000));
  const at = Date.parse(h);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

type Body = { error?: unknown; message?: unknown; errors?: unknown; detail?: unknown; title?: unknown; code?: unknown; serviceErrorCode?: unknown } | null;

function messageOf(body: unknown, status: number): { msg: string; code: string | null; sub: string | null } {
  const b = (body && typeof body === "object" ? body : null) as Body;
  let msg = "";
  let code: string | null = null;
  let sub: string | null = null;
  const e = b?.error;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; error_subcode?: unknown; errors?: { reason?: unknown; message?: unknown }[]; status?: unknown };
    msg = String(o.message ?? "");
    code = o.code != null ? String(o.code) : o.status != null ? String(o.status) : null;
    sub = o.error_subcode != null ? String(o.error_subcode) : Array.isArray(o.errors) && o.errors[0]?.reason ? String(o.errors[0].reason) : null;
  } else if (typeof e === "string") msg = e;
  if (!msg && b) msg = String(b.message ?? b.detail ?? b.title ?? "");
  if (!msg && Array.isArray(b?.errors) && b.errors[0]) msg = String((b.errors[0] as { message?: unknown; detail?: unknown }).message ?? (b.errors[0] as { detail?: unknown }).detail ?? "");
  if (!code && b?.code != null) code = String(b.code);
  if (!code && b?.serviceErrorCode != null) code = String(b.serviceErrorCode);
  return { msg: msg || `HTTP ${status}`, code, sub };
}

const RECONNECT = "Reconnect the account in Settings, then retry.";

/**
 * Maps an HTTP failure to a class, a plain-language message and a how-to-fix hint. Meta codes: 190/102 token, 4/17/32/613 rate limit,
 * 368 policy block, 200/10 permission, 2207xxx media errors; YouTube reasons: quotaExceeded, uploadLimitExceeded, forbidden; LinkedIn
 * 401/403/422/429; X 401/403/429. Anything else falls back on the HTTP status.
 */
export function classifyHttp(platformLabel: string, status: number, body: unknown, headers?: Headers | null): ProviderError {
  const { msg, code, sub } = messageOf(body, status);
  const retryAfterMs = parseRetryAfter(headers?.get("retry-after") ?? null) ?? (headers?.get("x-rate-limit-reset") ? Math.max(0, Number(headers.get("x-rate-limit-reset")) * 1000 - Date.now()) || null : null);
  const requestId = headers?.get("x-fb-trace-id") ?? headers?.get("x-li-request-id") ?? headers?.get("x-request-id") ?? headers?.get("x-fb-request-id") ?? null;
  const base = { status, code, retryAfterMs, requestId };
  const lower = msg.toLowerCase();
  const l = platformLabel;

  if (status === 429 || ["4", "17", "32", "613", "80001", "80002", "80006"].includes(code ?? "") || /quotaexceeded|ratelimitexceeded|dailylimitexceeded|uploadlimitexceeded|too many requests/i.test(`${sub} ${lower}`))
    return new ProviderError({ ...base, klass: "rate_limit", message: `${l} is limiting how fast we can post (${msg}).`, hint: "Nothing is wrong with the post. It will be retried automatically; if it keeps failing, wait for the daily limit to reset." });
  if (status === 401 || ["190", "102", "463", "467"].includes(code ?? "") || /invalid_token|expired|invalid credentials|unauthorized/i.test(lower) && status < 500)
    return new ProviderError({ ...base, klass: "auth", message: `${l} rejected the saved login (${msg}).`, hint: RECONNECT });
  if (code === "368" || /spam|policy|community guidelines|restricted|blocked from/i.test(lower))
    return new ProviderError({ ...base, klass: "policy", message: `${l} blocked this post (${msg}).`, hint: "Change the text or media so it follows the platform's content policy, then publish again." });
  if (status === 403 || ["200", "10", "299", "3"].includes(code ?? "") || /permission|not authorized|access denied|insufficient|scope/i.test(lower))
    return new ProviderError({ ...base, klass: "auth", message: `${l} says this account isn't allowed to do that (${msg}).`, hint: "A permission is missing. Reconnect the account and approve every permission, or check that your app has been approved for publishing." });
  if (/aspect ratio|aspect_ratio|ratio/i.test(lower) || ["2207009", "2207023"].includes(sub ?? ""))
    return new ProviderError({ ...base, klass: "media", message: `${l} doesn't accept this image or video shape (${msg}).`, hint: "Crop the media to a supported aspect ratio (for example 1:1, 4:5 or 9:16) and try again." });
  if (/too large|file size|size limit|exceed.*size|payload too large/i.test(lower) || status === 413 || ["2207004", "2207010"].includes(sub ?? ""))
    return new ProviderError({ ...base, klass: "media", message: `${l} says the file is too large (${msg}).`, hint: "Use a smaller or more compressed file." });
  if (/caption|too long|length|characters/i.test(lower) && status < 500)
    return new ProviderError({ ...base, klass: "media", message: `${l} says the text is too long (${msg}).`, hint: "Shorten the caption or hashtags." });
  if (/media|video|image|format|codec|duration|upload/i.test(lower) && status >= 400 && status < 500)
    return new ProviderError({ ...base, klass: "media", message: `${l} couldn't use the media (${msg}).`, hint: "Check the format, size and length against the platform limits shown in the publishing checklist." });
  if (status >= 500 || status === 408 || status === 409 || status === 425 || ["1", "2"].includes(code ?? ""))
    return new ProviderError({ ...base, klass: "transient", message: `${l} had a temporary problem (${msg}).`, hint: "This is retried automatically." });
  return new ProviderError({ ...base, klass: "permanent", message: `${l} refused the request (${msg}).`, hint: "Check the post details; if this repeats, contact support with the request id shown here." });
}

export function networkError(platformLabel: string, e: unknown): ProviderError {
  const name = (e as { name?: string })?.name;
  const timeout = name === "TimeoutError" || name === "AbortError";
  return new ProviderError({
    klass: "transient",
    message: timeout ? `${platformLabel} didn't answer in time.` : `Couldn't reach ${platformLabel} (${(e as Error)?.message ?? "network error"}).`,
    hint: "This is retried automatically.",
    code: timeout ? "timeout" : "network",
  });
}
