"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { DOMAIN_OPS, runPlatformDomainAction, type DomainOp, type PlatformDomainResult } from "@/lib/platform/domains/overview";

/** Re-check, retry attach, remove or set primary — for any company's domain. Audited in the lib. */
export async function platformDomainAction(host: string, op: string): Promise<PlatformDomainResult> {
  const user = await requirePlatformPermission("domains.manage");
  if (!DOMAIN_OPS.includes(op as DomainOp)) return { ok: false, error: "Unknown action." };
  const res = await runPlatformDomainAction(String(host), op as DomainOp, user.id);
  revalidatePath("/console", "layout");
  return res;
}

// ── Domain sync (moving to another Vercel account) ───────────────────────────

import { getDomainSyncOverview, retryHostSync, runDomainSyncTick, startDomainSync, summarizeHosts } from "@/lib/platform/domains/sync/run";
import type { DomainSyncOverview } from "@/lib/platform/domains/sync/run";

export type SyncStateResult = { ok: true; overview: DomainSyncOverview; message?: string } | { ok: false; error: string };

export async function startDomainSyncAction(dryRun: boolean): Promise<SyncStateResult> {
  const user = await requirePlatformPermission("domains.manage");
  const res = await startDomainSync({ dryRun: Boolean(dryRun), by: user.id, trigger: "manual" });
  if (!res.run) return { ok: false, error: res.error };
  return { ok: true, overview: await getDomainSyncOverview(), message: res.alreadyRunning ? "A sync is already running; showing its progress." : undefined };
}

/** Works on the running sync for about 40 seconds and returns where it is. The page calls this while a run is in progress. */
export async function tickDomainSyncAction(): Promise<SyncStateResult> {
  await requirePlatformPermission("domains.manage");
  const tick = await runDomainSyncTick({ budgetMs: 40_000 });
  const overview = await getDomainSyncOverview();
  if (tick.done) revalidatePath("/console/domains");
  return { ok: true, overview };
}

export async function domainSyncStatusAction(): Promise<SyncStateResult> {
  await requirePlatformPermission("domains.read");
  return { ok: true, overview: await getDomainSyncOverview() };
}

export async function retryHostSyncAction(host: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("domains.manage");
  const res = await retryHostSync(String(host), user.id);
  revalidatePath("/console/domains");
  return res;
}

const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;

/** Every host that needs attention, as CSV (hosts, reasons and the records to publish). */
export async function exportDomainProblemsAction(): Promise<{ ok: true; csv: string } | { ok: false; error: string }> {
  await requirePlatformPermission("domains.read");
  const { problems } = await summarizeHosts(100_000);
  const lines = [["host", "company", "company id", "problem", "reason", "records to publish", "checked at"].join(",")];
  for (const p of problems) lines.push([p.host, p.companyName, p.companyId, p.kind, p.reason, p.records.map((r) => `${r.type} ${r.name} ${r.value}`).join(" | "), p.checkedAt ?? ""].map(csvCell).join(","));
  return { ok: true, csv: lines.join("\n") };
}

// ── Platform hosts and DNS ───────────────────────────────────────────────────

import { checkDnsAuthority, copyDnsFromPreviousAccount } from "@/lib/platform/domains/sync/run";

export async function checkDnsAuthorityAction() {
  await requirePlatformPermission("domains.read");
  return checkDnsAuthority();
}

export async function copyDnsAction(dryRun: boolean) {
  const user = await requirePlatformPermission("domains.manage");
  return copyDnsFromPreviousAccount(Boolean(dryRun), user.id);
}
