"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { createIncident, deleteIncident, updateIncident, type IncidentResult, type NewIncident } from "@/lib/platform/status/incidents";

function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) {
    revalidatePath("/console/incidents");
    revalidatePath("/status");
  }
  return r;
}

export async function createIncidentAction(input: NewIncident): Promise<IncidentResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await createIncident(input, user.id));
}

export async function updateIncidentAction(id: string, input: { status: string; message: string; endedAt?: string }): Promise<IncidentResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await updateIncident(String(id), input, user.id));
}

export async function deleteIncidentAction(id: string): Promise<{ ok: boolean }> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await deleteIncident(String(id), user.id));
}
