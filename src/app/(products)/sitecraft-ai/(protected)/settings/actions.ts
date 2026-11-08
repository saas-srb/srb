"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { saveSettings, type CmsSettings } from "@/lib/products/sitecraft-ai/settings";
import { saveTracking, type TrackingSettings } from "@/lib/products/sitecraft-ai/tracking";

type Result = { ok: true } | { ok: false; error: string };

export async function saveSettingsAction(settings: CmsSettings): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "SETTINGS_MANAGE")) return { ok: false, error: "You don't have permission to do that." };
  await saveSettings(settings, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "default", entityLabel: "CMS settings" });
  return { ok: true };
}

/** Analytics, tracking scripts and search-engine verification for the company's public website. */
export async function saveTrackingAction(input: TrackingSettings): Promise<{ ok: true; saved: TrackingSettings } | { ok: false; error: string }> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!can(v, "SETTINGS_MANAGE")) return { ok: false, error: "You don't have permission to do that." };
  const saved = await saveTracking(input, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "tracking", entityLabel: "Tracking & verification" });
  return { ok: true, saved };
}
