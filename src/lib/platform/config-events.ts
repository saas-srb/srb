import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * "Configuration changed": the one small event shared configuration (company identity, provider connections, the product registry)
 * publishes when it is saved, so every product that cached a value refreshes it.
 *
 *  - in this server process the listeners run at once (`onConfigChange`)
 *  - across server instances a per-company, per-scope counter is stored (`config_versions`); a cache built with `versionedCache` re-checks
 *    that one tiny document at most every `recheckMs` and reloads when it moved, instead of waiting out a long time-to-live
 *
 * A scope is a short name such as `company-identity` or `connection:openai`. The event carries no values (nothing secret travels in it).
 */
export const CONFIG_VERSIONS_COLLECTION = "config_versions";

export interface ConfigChange { companyId: string; scope: string; version: number }
type Listener = (change: ConfigChange) => void;

const g = globalThis as unknown as { __configListeners?: Set<Listener>; __configSeq?: number };
const listeners = (g.__configListeners ??= new Set<Listener>());

/** Subscribes to changes made in THIS process. Returns the unsubscribe function. */
export function onConfigChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

async function versions() {
  return (await getDb()).collection<{ _id: string; v: number; at: Date }>(CONFIG_VERSIONS_COLLECTION);
}

/** Records that `scope` changed for the current company and tells every listener. */
export async function publishConfigChange(scope: string): Promise<number> {
  const companyId = await currentCompanyId();
  const tell = (version: number) => { for (const l of [...listeners]) { try { l({ companyId, scope, version }); } catch { /* a faulty listener never blocks a save */ } } };
  const doc = await (await versions()).findOneAndUpdate({ _id: scope }, { $inc: { v: 1 }, $set: { at: new Date() } }, { upsert: true, returnDocument: "after" });
  const version = doc?.v ?? 1;
  tell(version);
  return version;
}

/** The current version of a scope for the current company (0 = never changed). */
export async function configVersion(scope: string): Promise<number> {
  return (await (await versions()).findOne({ _id: scope }))?.v ?? 0;
}

/**
 * A small cache that is correct across instances: it serves the cached value, re-reads the scope's version at most every `recheckMs`,
 * and reloads when the version moved (or when a listener in this process was told). `ttlMs` is only a safety net.
 */
export function versionedCache<T>(scope: string, load: () => Promise<T>, opts: { recheckMs?: number; ttlMs?: number } = {}): () => Promise<T> {
  const recheckMs = opts.recheckMs ?? 2_000;
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const store = new Map<string, { at: number; checkedAt: number; version: number; value: T }>();
  onConfigChange((c) => { if (c.scope === scope) store.delete(c.companyId); });
  return async () => {
    const companyId = await currentCompanyId();
    const hit = store.get(companyId);
    const now = Date.now();
    if (hit && now - hit.at < ttlMs) {
      if (now - hit.checkedAt < recheckMs) return hit.value;
      const v = await configVersion(scope);
      if (v === hit.version) { hit.checkedAt = now; return hit.value; }
    }
    const version = await configVersion(scope);
    const value = await load();
    store.set(companyId, { at: now, checkedAt: now, version, value });
    return value;
  };
}
