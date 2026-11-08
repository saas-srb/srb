"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { getPublishSettings, savePublishSettings } from "@/lib/products/viralpulse-ai/publishers/publish-settings";
import { isValidTimezone } from "@/lib/products/viralpulse-ai/publishers/schedule";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";

/** Company-wide publishing switches. Needs MANAGE_INTEGRATIONS (same as connecting accounts). */
export async function savePublishingSettingsAction(input: { timezone: unknown; aiDisclosureOff: unknown; batchCap: unknown; gbpEnabled: unknown }) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const timezone = typeof input?.timezone === "string" ? input.timezone : "";
    if (!isValidTimezone(timezone)) throw new SmmsInputError("That time zone isn't recognised.");
    const cap = Math.round(Number(input?.batchCap));
    if (!Number.isFinite(cap) || cap < 1 || cap > 50) throw new SmmsInputError("Posts per run must be a whole number from 1 to 50.");
    const before = await getPublishSettings();
    const next = await savePublishSettings({ timezone, aiDisclosureOff: input.aiDisclosureOff === true, batchCap: cap, gbpEnabled: input.gbpEnabled === true }, v.userId);
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
    if (changed.length) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "settings", entityId: "publishing", entityLabel: "Publishing", summary: changed.map((k) => `${k}: ${String(before[k])} to ${String(next[k])}`).join(", ") });
    return { settings: next };
  });
}
