"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { saveSiteInfo, type SiteInfo } from "@/lib/products/sitecraft-ai/site-info";

type Result = { ok: true; saved: SiteInfo } | { ok: false; error: string };

/** Header + footer chrome, so either the navigation or the footer permission may edit it. */
export async function saveSiteInfoAction(info: SiteInfo): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "NAV_MANAGE") && !can(v, "FOOTER_MANAGE")) return { ok: false, error: "You don't have permission to do that." };
  const saved = await saveSiteInfo(info, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "settings", entityId: "site-info", entityLabel: "Site identity & contact" });
  return { ok: true, saved };
}
