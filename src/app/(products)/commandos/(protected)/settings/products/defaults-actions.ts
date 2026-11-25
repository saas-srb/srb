"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { resetCompanySetting } from "@/lib/platform/defaults/product/company";

/** "Reset to default" on a product settings screen. The same permission as the screen itself (`company.products`). */
export async function resetProductSettingAction(product: string, key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireWorkspaceAction("company.products");
  const res = await resetCompanySetting(String(product ?? ""), String(key ?? ""), user.id);
  if (res.ok) revalidatePath("/commandos/settings/products", "layout");
  return res;
}
