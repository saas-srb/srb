import "server-only";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { currentCompanyId, runAsCompany } from "@/lib/platform/tenancy/context";
import { onConfigChange } from "@/lib/platform/config-events";
import { gatherFacts } from "@/lib/platform/setup-progress/gather";
import { buildProgress } from "@/lib/platform/setup-progress/scoring";
import { STEPS } from "@/lib/platform/setup-progress/registry";
import { recordSnapshot } from "@/lib/platform/setup-progress/store";
import { recordPlatformSetup } from "@/lib/platform/setup-progress/platform";
import type { SetupProgress } from "@/lib/platform/setup-progress/types";

export * from "@/lib/platform/setup-progress/types";
export { STEPS, NOT_PART_OF_SETUP } from "@/lib/platform/setup-progress/registry";
export { buildProgress } from "@/lib/platform/setup-progress/scoring";


/**
 * The company's setup progress, computed on the server from real data in a few batched queries (`gather.ts`), cached for a short time per company and
 * dropped at once when any shared configuration changes (the "configuration changed" event: identity, connections, marks) or when a save asks for it.
 * The cache never holds the percentage as truth: it only avoids recomputing it on every page view.
 */
const TTL_MS = 20_000;
const cache = new Map<string, { at: number; value: SetupProgress }>();
const inflight = new Map<string, Promise<SetupProgress>>();
onConfigChange((c) => { cache.delete(c.companyId); });

export function forgetSetupProgress(companyId: string): void {
  cache.delete(companyId);
}

export async function getSetupProgress(opts: { fresh?: boolean } = {}): Promise<SetupProgress> {
  const companyId = await currentCompanyId();
  const hit = cache.get(companyId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const running = inflight.get(companyId);
  if (running && !opts.fresh) return running;
  const p = (async () => {
    // Steps of a product the company can't use are not part of its setup at all (not even listed as "not applicable").
    const hidden = await hiddenProducts();
    const steps = STEPS.filter((s) => !(s.product && hidden.has(s.product)) && hrefAvailable(s.href, hidden));
    const value = buildProgress(steps, await gatherFacts());
    cache.set(companyId, { at: Date.now(), value });
    // The Platform Console list reads the last percentage from here (never the truth: it is only a cache for the list).
    void recordPlatformSetup(companyId, value.summary.percent).catch(() => {});
    return value;
  })().finally(() => inflight.delete(companyId));
  inflight.set(companyId, p);
  return p;
}

/** Computes for another company (the Platform Console list, the reminder job) and writes today's snapshot. */
export async function setupProgressFor(companyId: string, opts: { snapshot?: boolean } = {}): Promise<SetupProgress> {
  return runAsCompany(companyId, async () => {
    const value = await getSetupProgress({ fresh: true });
    if (opts.snapshot) await recordSnapshot(value.summary.percent).catch(() => {});
    return value;
  });
}

/** What the slim strip needs: shown to a Director of a customer company until setup is 100% (replaces the old five-step count). */
export async function setupStrip(roles: readonly string[], isPlatformOwnerCompany: boolean): Promise<{ show: boolean; percent: number; done: number; total: number }> {
  if (!roles.includes("super_admin") || isPlatformOwnerCompany) return { show: false, percent: 0, done: 0, total: 0 };
  const p = await getSetupProgress();
  return { show: !p.summary.complete, percent: p.summary.percent, done: p.summary.done, total: p.summary.applicable };
}
