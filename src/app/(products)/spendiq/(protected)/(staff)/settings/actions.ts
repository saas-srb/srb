"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageSettings } from "@/lib/prms-roles";
import { updatePrmsSettings, normalizeSettingsInput } from "@/lib/products/spendiq/settings";
import { recordAudit } from "@/lib/products/spendiq/audit";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

export async function savePrmsSettingsAction(input: Record<string, unknown>): Promise<SettingsActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageSettings(user)) throw new Error("Forbidden");

  const data = normalizeSettingsInput(input);
  await updatePrmsSettings(data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "settings",
    entityId: "config",
    entityLabel: "SpendIQ settings",
    summary: `default ${data.defaultCurrency} · review threshold ${data.procurementReviewThreshold}`,
  });
  revalidatePath("/spendiq/settings");
  revalidatePath("/spendiq");
  return { ok: true };
}
