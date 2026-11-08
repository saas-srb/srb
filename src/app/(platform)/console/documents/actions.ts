"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { setPdfEnabled, setSectionEnabled, type ControlResult } from "@/lib/platform/feature-controls";
import { PDF_BY_KEY } from "@/lib/pdf/catalog";

const done = <T>(res: T) => {
  revalidatePath("/console/documents");
  return res;
};

/** Show or hide the Documents & PDFs page for every company (the PDFs themselves keep working). */
export async function setPdfLibraryEnabledAction(enabled: boolean): Promise<ControlResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await setSectionEnabled("pdfLibrary", enabled === true, { id: user.id, email: user.email }));
}

/** Turn one kind of PDF on or off for every company. */
export async function setPdfEnabledAction(type: string, enabled: boolean): Promise<ControlResult> {
  const user = await requirePlatformPermission("settings.manage");
  const t = PDF_BY_KEY.get(String(type ?? ""));
  if (t && t.status !== "active") return { ok: false, error: "This document isn't produced by a screen, so there is nothing to turn off." };
  return done(await setPdfEnabled(String(type ?? ""), enabled === true, { id: user.id, email: user.email }, !!t));
}
