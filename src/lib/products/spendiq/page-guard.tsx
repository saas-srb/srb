import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentPrmsUser, type CurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan } from "@/lib/prms-access";

/** Page guard for a SpendIQ section: the signed-in user when they hold `key` (or any of them); otherwise the polite locked page (the menu already hides what a person cannot use). */
export async function prmsPage(key: string | string[], feature: string): Promise<{ user: CurrentPrmsUser; locked: null } | { user: null; locked: ReactNode }> {
  const user = await getCurrentPrmsUser();
  if (!user) redirect("/spendiq/login");
  if (!(Array.isArray(key) ? key : [key]).some((k) => prmsCan(user, k))) return { user: null, locked: <ProductLocked product="spendiq" feature={feature} /> };
  return { user, locked: null };
}
