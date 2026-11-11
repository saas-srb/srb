"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { adoptEnvironment, adoptedSummary } from "@/lib/platform/adopt";
import { ensureLegacyCopy, legacyCopyStatus, runLegacyCopyTick, type FileCopyView } from "@/lib/storage/blob-to-gridfs";

/** "Import from environment": copies what this deployment's environment provides and the database lacks. Never overwrites. */
export async function importFromEnvironmentAction(): Promise<{ ok: true; adopted: string[]; total: number } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("integrations.manage");
  const res = await adoptEnvironment({ actorId: user.id, trigger: "manual" });
  revalidatePath("/console", "layout");
  return { ok: true, adopted: res.adopted, total: res.total };
}

export async function adoptedSummaryAction() {
  await requirePlatformPermission("integrations.read");
  return adoptedSummary();
}

/** Looks at the old Blob store again and copies what is missing from the database (about 40 seconds per call). */
export async function fileCopyTickAction(restart: boolean): Promise<FileCopyView> {
  await requirePlatformPermission("integrations.manage");
  if (restart) await ensureLegacyCopy(true);
  const v = await runLegacyCopyTick(40_000);
  return v;
}

export async function fileCopyStatusAction(): Promise<FileCopyView> {
  await requirePlatformPermission("integrations.read");
  return legacyCopyStatus();
}
