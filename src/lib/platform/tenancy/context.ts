import { resolveUsageActor } from "@/lib/platform/billing/usage-actor";
import { withUsageActor } from "@/lib/platform/billing/usage-actor-store";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { getPlatformOwnerCompanyId, listActiveCompanyIds, resolveCompanyIdByHost } from "@/lib/platform/tenancy/companies";

/**
 * Which company the current code is acting for. Resolved, in order, from:
 *  1. an explicit `runAsCompany(companyId, fn)` scope — crons, webhooks,
 *     cached loaders, scripts, the proxy
 *  2. the current request's Host header (see `companies.ts` for routing)
 * There is no default company: outside both, `currentCompanyId()` throws.
 */

export class TenantResolutionError extends Error {
  constructor(
    message: string,
    readonly host: string | null = null,
  ) {
    super(message);
    this.name = "TenantResolutionError";
  }
}

const storage = new AsyncLocalStorage<{ companyId: string }>();

export function runAsCompany<T>(companyId: string, fn: () => T): T {
  if (!companyId) throw new TenantResolutionError("runAsCompany() needs a company id");
  return storage.run({ companyId }, fn);
}

/** undefined = not inside a request at all (script, build step, background job). */
async function requestHost(): Promise<string | null | undefined> {
  try {
    return (await headers()).get("host");
  } catch (err) {
    // Next's own control-flow errors (dynamic-rendering bailout during a
    // static build, etc.) must propagate untouched.
    unstable_rethrow(err);
    return undefined;
  }
}

/** The company for this request: an explicit scope, else the Host. `host: undefined` = not in a request. */
async function resolveCurrent(): Promise<{ id: string | null; host: string | null | undefined }> {
  const store = storage.getStore();
  if (store) return { id: store.companyId, host: null };
  const host = await requestHost();
  if (host === undefined) return { id: null, host };
  return { id: await resolveCompanyIdByHost(host), host };
}

/**
 * The current company. Inside a request whose host no (active) company owns
 * — an unknown or just-suspended domain — this is a 404 (`notFound()`), not a
 * server error: the proxy normally shows "No workspace here" first, but its
 * routing cache is per instance and can lag a status change by a minute.
 * Outside any request or company scope it throws `TenantResolutionError`.
 */
export async function currentCompanyId(): Promise<string> {
  const { id, host } = await resolveCurrent();
  if (id) return id;
  if (host === undefined) throw new TenantResolutionError("No company context: not inside a request or runAsCompany()");
  notFound();
}

/** Like `currentCompanyId()`, but null (never throws) when no company owns this request. */
export async function currentCompanyIdOrNull(): Promise<string | null> {
  return (await resolveCurrent()).id;
}

/**
 * Whether the current request belongs to the company that runs the platform
 * (the operator). Gates things that are genuinely the operator's own and must not
 * leak into other workspaces: its analytics tags, and integrations still
 * configured by platform-wide env credentials (payment/payout providers).
 */
export async function isPlatformOwnerContext(): Promise<boolean> {
  const [id, ownerId] = await Promise.all([currentCompanyIdOrNull(), getPlatformOwnerCompanyId()]);
  return id !== null && id === ownerId;
}

/**
 * Runs `fn` once per active company, each inside its own company scope —
 * for crons and other platform-wide jobs. One company failing doesn't stop
 * the others; failures are reported per company.
 */
export async function forEachCompany<T>(fn: (companyId: string) => Promise<T>): Promise<{ companyId: string; ok: boolean; result?: T; error?: string }[]> {
  const out: { companyId: string; ok: boolean; result?: T; error?: string }[] = [];
  for (const companyId of await listActiveCompanyIds()) {
    try {
      out.push({ companyId, ok: true, result: await runAsCompany(companyId, () => fn(companyId)) });
    } catch (err) {
      console.error(`[tenancy] job failed for company ${companyId}`, err);
      out.push({ companyId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/**
 * `after()` for work that touches company data. The company is captured now,
 * while the request is still in scope — Server Components can't read request
 * headers inside `after` — and restored around the callback.
 */
export async function afterForCompany(fn: () => unknown): Promise<void> {
  const { after } = await import("next/server");
  const companyId = await currentCompanyId();
  // The person who started the work keeps it in the usage history (it runs after the response, when the request is gone).
  const actor = await resolveUsageActor().catch(() => undefined);
  after(() => runAsCompany(companyId, () => (actor ? withUsageActor(actor, fn) : fn())));
}
