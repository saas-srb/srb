"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { endMaintenanceNow, saveMaintenance, type MaintenanceInput, type MaintenanceResult } from "@/lib/platform/maintenance";
import type { MaintenanceState } from "@/lib/platform/maintenance-shared";

export async function saveMaintenanceAction(input: MaintenanceInput, companyId?: string): Promise<MaintenanceResult> {
  // Platform-wide needs the platform-settings permission; one company's window is part of managing that company.
  const user = await requirePlatformPermission(companyId ? "companies.status" : "settings.manage");
  const res = await saveMaintenance(
    {
      enabled: Boolean(input?.enabled),
      message: String(input?.message ?? ""),
      mode: input?.mode === "banner" ? "banner" : "takeover",
      appliesTo: input?.appliesTo === "sites" || input?.appliesTo === "apps" ? input.appliesTo : "both",
      startsAt: String(input?.startsAt ?? ""),
      durationHours: Number(input?.durationHours),
    },
    user.id,
    companyId || undefined,
  );
  // The banner is part of every page's layout.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function endMaintenanceAction(companyId?: string): Promise<{ ok: true; state: MaintenanceState }> {
  const user = await requirePlatformPermission(companyId ? "companies.status" : "settings.manage");
  const state = await endMaintenanceNow(user.id, companyId || undefined);
  revalidatePath("/", "layout");
  return { ok: true, state };
}
