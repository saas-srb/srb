import "server-only";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * How the calling engine learns about the other products, safely.
 *
 * 1. `ensureIntegrations()` — the products register their do-not-contact providers, caller lookups, settled-call handlers and target
 *    authorizers when their modules load. A process that never rendered one of those pages would otherwise have an EMPTY registry, and
 *    "no provider said no" would mean "may call". So every engine path that depends on the registry awaits this once (the loader is a
 *    dynamic import, which also avoids an import cycle with the products that import the engine). If loading fails the promise is
 *    dropped so the next call tries again, and the caller refuses to act.
 * 2. Target authorizers — who may point a call at a given record. Default deny: a product that did not register one cannot be targeted.
 */

export type TargetAuthorizer = (viewer: AibotsViewer, target: CallTarget) => Promise<boolean>;

const g = globalThis as unknown as { __agentosTargetAuthorizers?: Map<string, TargetAuthorizer>; __agentosIntegrations?: { loading: Promise<void> | null; loader: () => Promise<unknown> } };
const authorizers = (g.__agentosTargetAuthorizers ??= new Map());
const state = (g.__agentosIntegrations ??= { loading: null, loader: () => import("@/lib/products/call-integrations") });

export function registerTargetAuthorizer(product: string, fn: TargetAuthorizer): void {
  authorizers.set(product, fn);
}

/** Loads every product's call hooks once per process. Rejects (and will retry on the next call) when they could not be loaded. */
export function ensureIntegrations(): Promise<void> {
  if (!state.loading) {
    state.loading = state
      .loader()
      .then(() => undefined)
      .catch((e) => {
        state.loading = null;
        console.error("[agentos calls] product call hooks could not be loaded", e instanceof Error ? e.message : e);
        throw e;
      });
  }
  return state.loading;
}

/** Test hook: replace the loader (null restores the real one) and forget that integrations were loaded. */
export function setIntegrationsLoaderForTest(loader: (() => Promise<unknown>) | null): void {
  state.loader = loader ?? (() => import("@/lib/products/call-integrations"));
  state.loading = null;
}
export function clearTargetAuthorizers(): void {
  authorizers.clear();
}

/** True only when the product registered an authorizer and it says this person may call about this record. Errors deny. */
export async function authorizeTarget(viewer: AibotsViewer, target: CallTarget): Promise<boolean> {
  try {
    await ensureIntegrations();
  } catch {
    return false; // the products' hooks could not be loaded: nobody is authorised
  }
  const fn = authorizers.get(target.product);
  if (!fn) return false;
  try {
    return (await fn(viewer, target)) === true;
  } catch (e) {
    console.error(`[agentos calls] target authorizer failed (${target.product})`, e instanceof Error ? e.message : e);
    return false;
  }
}
