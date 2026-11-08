import { classifyHttp, networkError, ProviderError, redact } from "./errors";
import { withRetry } from "./retry";
import type { PublishCtx } from "./types";

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface CallOpts {
  /** Platform label used in messages. */
  label: string;
  timeoutMs?: number;
  /** Retries inside this call for transient / rate-limit failures that ask for a short wait. */
  retries?: number;
  /** Statuses that are not errors for this call (e.g. 308 for resumable uploads). */
  okStatuses?: number[];
  /** Safe to repeat (GET, PUT of the same bytes). Non-idempotent POSTs are never retried here. */
  idempotent?: boolean;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Host + path only: query strings carry tokens in some Graph calls. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "invalid-url";
  }
}

/**
 * One provider call: timeout, cancellation, 401 -> refresh once, classification into ProviderError, bounded in-call retry (idempotent
 * calls only), request-id capture and token-free logging. `build` receives the current token so a refreshed one is used on the retry.
 */
export async function call<T = unknown>(ctx: PublishCtx, build: (token: string) => { url: string; init?: RequestInit }, o: CallOpts): Promise<HttpResult<T>> {
  let token = ctx.creds.token;
  let refreshed = false;
  const once = async (): Promise<HttpResult<T>> => {
    const { url, init } = build(token);
    const signals = [AbortSignal.timeout(o.timeoutMs ?? 30_000), ...(ctx.signal ? [ctx.signal] : [])];
    let res: Response;
    try {
      res = await ctx.fetch(url, { ...init, signal: AbortSignal.any(signals) });
    } catch (e) {
      if (ctx.signal?.aborted) throw new ProviderError({ klass: "permanent", message: "Publishing was cancelled.", hint: "Start it again when ready.", code: "cancelled" });
      throw networkError(o.label, e);
    }
    const body = (await parse(res)) as T;
    const rid = res.headers.get("x-fb-trace-id") ?? res.headers.get("x-li-request-id") ?? res.headers.get("x-request-id") ?? res.headers.get("x-goog-request-id");
    ctx.noteRequestId(rid);
    ctx.log("http", { method: init?.method ?? "GET", url: safeUrl(url), status: res.status, requestId: rid });
    if (res.ok || (o.okStatuses ?? []).includes(res.status)) return { status: res.status, body, headers: res.headers };
    throw classifyHttp(o.label, res.status, body, res.headers);
  };
  const run = async (): Promise<HttpResult<T>> => {
    try {
      return await once();
    } catch (e) {
      if (e instanceof ProviderError && e.klass === "auth" && e.status === 401 && !refreshed && ctx.creds.refresh) {
        refreshed = true;
        const t = await ctx.creds.refresh().catch(() => null);
        if (t) {
          token = t;
          ctx.creds.token = t;
          return once();
        }
      }
      throw e;
    }
  };
  if (!o.idempotent) return run();
  return withRetry(run, { retries: o.retries ?? 2, sleep: ctx.sleep });
}

export const form = (o: Record<string, string | number | boolean | undefined | null>): { headers: Record<string, string>; body: string } => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() };
};

/** Reads a web stream in fixed-size pieces so only one chunk is ever held in memory. */
export async function* chunks(stream: ReadableStream<Uint8Array>, size: number): AsyncGenerator<Buffer> {
  const reader = stream.getReader();
  let buf: Buffer = Buffer.alloc(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value && value.length) buf = buf.length ? Buffer.concat([buf, value]) : Buffer.from(value);
      while (buf.length >= size) {
        yield buf.subarray(0, size);
        buf = buf.subarray(size);
      }
      if (done) break;
    }
    if (buf.length) yield buf;
  } finally {
    reader.releaseLock();
  }
}

export function safeMessage(e: unknown): string {
  return redact(e instanceof Error ? e.message : String(e)).slice(0, 300);
}
