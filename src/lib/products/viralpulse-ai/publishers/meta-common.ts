import { call, form } from "./http";
import { ProviderError } from "./errors";
import { PendingProcessing, type PublishCtx } from "./types";

export const graphBase = (ctx: PublishCtx): string => ctx.creds.extra?.graph ?? "https://graph.facebook.com/v23.0";

const urlFor = (ctx: PublishCtx, path: string) => (path.startsWith("http") ? path : `${graphBase(ctx)}${path}`);

export async function graphPost<T>(ctx: PublishCtx, label: string, path: string, params: Record<string, string | number | boolean | undefined | null>, idempotent = false): Promise<T> {
  const r = await call<T>(
    ctx,
    (token) => {
      const f = form({ ...params, access_token: token });
      return { url: urlFor(ctx, path), init: { method: "POST", headers: f.headers, body: f.body } };
    },
    { label, idempotent },
  );
  return r.body;
}

export async function graphGet<T>(ctx: PublishCtx, label: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const r = await call<T>(ctx, (token) => ({ url: `${urlFor(ctx, path)}?${new URLSearchParams({ ...params, access_token: token })}`, init: { method: "GET" } }), { label, idempotent: true });
  return r.body;
}

/** How long the platform may take to process a container before we give up (Meta recommends polling once a minute for up to 5 minutes). */
export const PROCESSING_DEADLINE_MS = 15 * 60_000;
export const POLL_EVERY_MS = 60_000;

export function pendingOrTimeout(ctx: PublishCtx, startedAtIso: string | undefined, label: string): never {
  const started = startedAtIso ? Date.parse(startedAtIso) : ctx.now().getTime();
  if (ctx.now().getTime() - started > PROCESSING_DEADLINE_MS)
    throw new ProviderError({ klass: "media", message: `${label} is taking too long to process the media.`, hint: "Try a smaller file or re-export the video (H.264 video with AAC audio, MP4), then publish again.", code: "processing_timeout" });
  throw new PendingProcessing(POLL_EVERY_MS);
}
