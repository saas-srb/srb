import "server-only";
import { LeaseLostError, countRecentStarts, saveProgress, settle, type AttemptDoc } from "./attempts";
import { ProviderError, redact } from "./errors";
import { PUBLISHER_MODULES } from "./index";
import { backoffMs } from "./retry";
import { PendingProcessing, type Credentials, type MediaFacts, type PlatformKey, type PublishCtx, type PublishIssue, type PublishPost, type PublishResult } from "./types";
import { hasErrors } from "./validate";

/** Everything the engine needs from the outside world; tests substitute fakes, `engine-deps.ts` has the real ones. */
export interface RunInput {
  post: PublishPost;
  images: MediaFacts[];
  video: MediaFacts | null;
  thumbnail: MediaFacts | null;
  scheduleAt: Date | null;
  disclosure: { mode: string; nativeFlag: boolean; reason: string };
  /** The post is gone, archived or already published elsewhere: do not publish. */
  skip?: string | null;
}

export interface EngineDeps {
  loadInput(a: AttemptDoc): Promise<RunInput>;
  credentials(platform: PlatformKey, accountId: string | null): Promise<Credentials>;
  platformEnabled(platform: PlatformKey, accountId?: string | null): Promise<{ ok: true } | { ok: false; reason: string; hint: string }>;
  publicUrl(mediaId: string, opts?: { jpeg?: boolean }): Promise<string>;
  openStream(mediaId: string): Promise<ReadableStream<Uint8Array>>;
  imageBytes(mediaId: string, opts?: { jpeg?: boolean; maxSide?: number }): Promise<{ bytes: Buffer; contentType: string }>;
  reportAccountError(platform: PlatformKey, message: string, accountId?: string | null): Promise<void>;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  now(): Date;
  rand?: () => number;
  /** Wall-clock budget of one run (cron functions have a hard limit). */
  runBudgetMs?: number;
  log(event: string, fields: Record<string, unknown>): void;
}

export type Outcome =
  | { kind: "published"; attempt: AttemptDoc; result: PublishResult }
  | { kind: "retry"; attempt: AttemptDoc; error: ProviderError }
  | { kind: "processing"; attempt: AttemptDoc }
  | { kind: "failed"; attempt: AttemptDoc; error: ProviderError }
  | { kind: "cancelled"; attempt: AttemptDoc | null }
  | { kind: "lost" };

const fail = (klass: ProviderError["klass"], message: string, hint: string, code?: string) => new ProviderError({ klass, message, hint, code });

/** Structured, token-free log line. */
export function logLine(event: string, fields: Record<string, unknown>): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = typeof v === "string" ? redact(v) : v;
  console.log(JSON.stringify({ src: "viralpulse.publish", event, ...safe }));
}

export function issueSummary(issues: PublishIssue[]): string {
  return issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ").slice(0, 400);
}

/**
 * Runs one claimed attempt (the caller holds the lease) as far as it can go: validate -> budget -> credentials -> reconcile if a
 * previous run died at the commit point -> publish. Returns what happened; state and backoff are persisted here.
 */
export async function runAttempt(a: AttemptDoc, deps: EngineDeps): Promise<Outcome> {
  const owner = a.leaseOwner ?? "";
  const mod = PUBLISHER_MODULES[a.platform];
  const log = (event: string, f: Record<string, unknown> = {}) => deps.log(event, { attemptId: a._id, postId: a.postId, platform: a.platform, ...f });
  let resolvedAccount: string | null = null;
  const finishFail = async (e: ProviderError, retry: boolean, extra: { clearCommit?: boolean } = {}): Promise<Outcome> => {
    const attemptsNow = a.attempts + 1;
    const willRetry = retry && e.retryable && attemptsNow < a.maxAttempts;
    const next = willRetry ? new Date(deps.now().getTime() + backoffMs(attemptsNow, { retryAfterMs: e.retryAfterMs, rand: deps.rand })) : null;
    if (e.klass === "auth") await deps.reportAccountError(a.platform, e.message, resolvedAccount ?? a.accountId).catch(() => {});
    const row = await settle(a._id, owner, { state: willRetry ? "queued" : "failed", note: `${e.klass}: ${e.message}`, errorClass: e.klass, errorCode: e.code, message: e.message, hint: e.hint, nextAttemptAt: next, countFailure: true, ...extra });
    log(willRetry ? "retry_scheduled" : "failed", { class: e.klass, code: e.code, status: e.status, next: next?.toISOString() });
    if (!row) return { kind: "lost" };
    return willRetry ? { kind: "retry", attempt: row, error: e } : { kind: "failed", attempt: row, error: e };
  };

  let input: RunInput;
  try {
    input = await deps.loadInput(a);
  } catch (e) {
    return finishFail(e instanceof ProviderError ? e : fail("transient", `Couldn't load the post: ${(e as Error).message}`, "This is retried automatically."), true);
  }
  if (input.skip) {
    const row = await settle(a._id, owner, { state: "cancelled", note: input.skip, message: input.skip });
    return { kind: "cancelled", attempt: row };
  }

  const enabled = await deps.platformEnabled(a.platform, a.accountId);
  if (!enabled.ok) return finishFail(fail("permanent", enabled.reason, enabled.hint, "platform_disabled"), false);

  const issues = mod.validate(input.post, { images: input.images, video: input.video, thumbnail: input.thumbnail });
  if (hasErrors(issues)) return finishFail(fail("media", `Not ready to publish: ${issueSummary(issues)}`, "Fix the items in the publishing checklist, then retry.", "validation"), false);

  // Rolling-window budget per account (Instagram 100 / 24 h, Facebook Reels 30, YouTube uploads 100 ...). Waiting costs no attempt.
  const budget = mod.capabilities.dailyBudget;
  if (budget && !a.data.started) {
    const since = new Date(deps.now().getTime() - 24 * 3600_000);
    const used = await countRecentStarts(a.platform, a.accountId, since);
    if (used.count >= budget) {
      const at = new Date((used.oldest ?? deps.now()).getTime() + 24 * 3600_000 + 60_000);
      const row = await settle(a._id, owner, { state: "queued", note: `Waiting for the ${mod.capabilities.label} 24-hour limit (${used.count}/${budget})`, nextAttemptAt: at, errorClass: "rate_limit", message: `${mod.capabilities.label}'s daily publishing limit for this account has been reached (${used.count}/${budget}).`, hint: "It will publish automatically when the limit frees up." });
      log("budget_wait", { used: used.count, budget });
      return row ? { kind: "retry", attempt: row, error: fail("rate_limit", "Daily limit reached", "Waiting for the limit to free up.", "budget") } : { kind: "lost" };
    }
  }

  let creds: Credentials;
  try {
    creds = await deps.credentials(a.platform, a.accountId);
  } catch (e) {
    return finishFail(fail("auth", (e as Error).message || "The account isn't connected.", "Connect or reconnect the account in Settings, then retry.", "no_credentials"), false);
  }

  resolvedAccount = creds.accountId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.runBudgetMs ?? 240_000);
  const ctx: PublishCtx = {
    platform: a.platform,
    post: input.post,
    images: input.images,
    video: input.video,
    thumbnail: input.thumbnail,
    creds,
    data: { ...a.data, started: true },
    committed: a.committed,
    scheduleAt: input.scheduleAt,
    publicUrl: deps.publicUrl,
    openStream: deps.openStream,
    imageBytes: deps.imageBytes,
    fetch: deps.fetch,
    signal: controller.signal,
    sleep: deps.sleep,
    now: deps.now,
    log,
    noteRequestId: (id) => {
      if (id) void saveProgress(a._id, owner, {}, { requestId: id }).catch(() => {});
    },
    async checkpoint(patch) {
      Object.assign(ctx.data, patch);
      for (const [k, v] of Object.entries(patch)) if (v === null || v === undefined) delete ctx.data[k];
      await saveProgress(a._id, owner, patch);
    },
    async markCommitPoint() {
      ctx.committed = true;
      await saveProgress(a._id, owner, {}, { committed: true });
    },
  };

  try {
    await saveProgress(a._id, owner, { started: true }, { state: "uploading" });
    if (a.committed) {
      // A previous run died after sending the final call. Never send it again blindly.
      if (!mod.reconcile) throw fail("ambiguous", `A previous try may already have posted to ${mod.capabilities.label}, so it wasn't sent again.`, `Check ${mod.capabilities.label}. If the post is there, mark it as published; otherwise use Retry and confirm.`, "ambiguous");
      const found = await mod.reconcile(ctx);
      if (found) return await done(a, owner, found, input, deps, log);
      ctx.committed = false;
      await saveProgress(a._id, owner, {}, { committed: false });
    }
    if (mod.precheck && !a.data.containerId) await mod.precheck(ctx);
    const result = await mod.publish(ctx);
    return await done(a, owner, result, input, deps, log);
  } catch (e) {
    if (e instanceof LeaseLostError) {
      log("lease_lost", { cancelled: e.cancelled });
      if (e.cancelled) {
        const row = await settle(a._id, owner, { state: "cancelled", note: "Cancelled" }).catch(() => null);
        return { kind: "cancelled", attempt: row };
      }
      return { kind: "lost" };
    }
    if (e instanceof PendingProcessing) {
      const row = await settle(a._id, owner, { state: "processing", note: e.message, nextAttemptAt: new Date(deps.now().getTime() + e.afterMs), errorClass: null, message: e.message });
      log("processing", { afterMs: e.afterMs });
      return row ? { kind: "processing", attempt: row } : { kind: "lost" };
    }
    const pe = e instanceof ProviderError ? e : controller.signal.aborted ? fail("transient", "This publish ran out of time and will continue shortly.", "It resumes automatically.", "run_budget") : fail("transient", `Unexpected problem: ${redact((e as Error)?.message ?? String(e)).slice(0, 200)}`, "This is retried automatically.", "unexpected");
    if (pe.klass === "ambiguous") return finishFail(pe, false);
    return finishFail(pe, true);
  } finally {
    clearTimeout(timer);
  }
}

async function done(a: AttemptDoc, owner: string, result: PublishResult, input: RunInput, deps: EngineDeps, log: (e: string, f?: Record<string, unknown>) => void): Promise<Outcome> {
  const row = await settle(a._id, owner, { state: "published", note: "Published", externalId: result.externalId, url: result.url, extraIds: result.extraIds ?? null, warnings: result.warnings ?? [], errorClass: null, message: null, hint: null, countFailure: false, disclosure: input.disclosure });
  log("published", { externalId: result.externalId });
  void deps;
  return row ? { kind: "published", attempt: row, result } : { kind: "lost" };
}
