"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { savePlatformDefaults, type SaveDefaultsResult } from "@/lib/platform/defaults/product/store";

/** Saves a product's platform defaults (only the settings sent; the rest follow the built-in defaults). Staff permission, validated, audited. */
export async function saveProductDefaultsAction(product: string, values: Record<string, unknown>): Promise<SaveDefaultsResult> {
  const user = await requirePlatformPermission("defaults.manage");
  const res = await savePlatformDefaults(String(product ?? ""), values && typeof values === "object" ? values : {}, user.id);
  if (res.ok) revalidatePath("/console/product-settings");
  return res;
}
