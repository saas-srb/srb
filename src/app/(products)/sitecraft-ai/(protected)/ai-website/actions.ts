"use server";

import { revalidatePath } from "next/cache";
import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { expireSiteCache } from "@/lib/products/sitecraft-ai/db";
import { generateAiWebsite, restoreAiWebsiteVersion } from "@/lib/platform/website/ai/apply";

type Result = { ok: true; pages: number } | { ok: false; error: string };

/** Writes (or rewrites) the company's website from its business categories. Replaces only pages the platform made, never the company's own. */
export async function generateWebsiteAction(ownerPrompt?: string): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: "You don't have permission to do that." };
  const res = await generateAiWebsite({ force: true, ownerPrompt });
  if (res.ok) {
    expireSiteCache();
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "settings", entityId: "ai-website", entityLabel: "AI-generated website" });
    revalidatePath("/sitecraft-ai/ai-website");
  }
  return res;
}

/** Switches the site back to an earlier version. Nothing is deleted; the switch is saved as a new version too. */
export async function restoreWebsiteVersionAction(id: string): Promise<{ ok: true; number: number } | { ok: false; error: string }> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: "You don't have permission to do that." };
  const res = await restoreAiWebsiteVersion(id);
  if (res.ok) {
    expireSiteCache();
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "settings", entityId: "ai-website", entityLabel: `AI-generated website restored to version ${res.number}` });
    revalidatePath("/sitecraft-ai/ai-website");
  }
  return res;
}
