"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { pmsCan, pmsSeesAll } from "@/lib/pms-access";
import { updatePmsSettings, normalizeSettingsInput } from "@/lib/products/sprintos/settings";
import { recordActivity } from "@/lib/products/sprintos/activity";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

export async function savePmsSettingsAction(input: Record<string, unknown>): Promise<SettingsActionResult> {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!pmsCan(user, "settings.manage")) throw new Error("Forbidden");

  const data = normalizeSettingsInput(input);
  await updatePmsSettings(data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "settings",
    entityId: "config",
    entityLabel: "SprintOS settings",
    summary: `${data.categories.length} categories · default ${data.defaultCurrency}`,
  });
  revalidatePath("/sprintos/settings");
  revalidatePath("/sprintos/projects/new");
  return { ok: true };
}
