import "server-only";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { getUsage, usagePeriod } from "@/lib/platform/billing/usage";
import { notifyPanel } from "@/lib/notify";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";

/**
 * "You are close to / at your plan limit" — raised when a meter CROSSES 80% or 100% (not on every use), once per period per level.
 * The Workspace admins are told; for AI tokens the AI products' admins are told too, since it is their assistants that stop working.
 */
const crossed = (before: number, after: number, limit: number) => {
  for (const t of [1, 0.8]) if (before < limit * t && after >= limit * t) return t === 1 ? 100 : 80;
  return 0;
};

export async function checkAiTokenUsage(addedTokens: number): Promise<void> {
  try {
    const limit = (await getEntitlements()).limits.aiTokensPerMonth;
    if (limit === null || limit <= 0) return;
    const after = await getUsage("ai_tokens");
    const pct = crossed(after - addedTokens, after, limit);
    if (!pct) return;
    const period = usagePeriod();
    await workspaceEvents.usage("AI tokens", pct, period);
    const n = { type: "ai_usage", title: pct >= 100 ? "AI allowance used up for this month" : "AI allowance is 80% used", body: pct >= 100 ? "AI features pause until the 1st, or until you upgrade." : "Consider upgrading before AI features pause.", link: "/commandos/settings/billing", priority: pct >= 100 ? ("high" as const) : ("normal" as const), dedupeKey: `ai-usage:${period}:${pct}` };
    await Promise.all([notifyPanel("intelligence", n, { level: "admin" }), notifyPanel("aibots", { ...n, dedupeKey: `ai-usage-bots:${period}:${pct}` }, { level: "admin" })]);
  } catch (err) {
    console.error("[notify] ai usage check failed", err instanceof Error ? err.message : err);
  }
}

export async function checkStorageUsage(beforeBytes: number, afterBytes: number): Promise<void> {
  try {
    const mb = (await getEntitlements()).limits.storageMb;
    if (mb === null || mb <= 0) return;
    const pct = crossed(beforeBytes, afterBytes, mb * 1024 * 1024);
    if (pct) await workspaceEvents.usage("File storage", pct, usagePeriod());
  } catch {
    /* never block a upload */
  }
}

export async function checkSeatUsage(used: number): Promise<void> {
  try {
    const limit = (await getEntitlements()).limits.seats;
    if (limit === null || limit <= 0) return;
    const pct = used >= limit ? 100 : used >= limit * 0.8 ? 80 : 0;
    if (pct) await workspaceEvents.usage("User seats", pct, `${pct}`);
  } catch {
    /* never block adding a person */
  }
}
