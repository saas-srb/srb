import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentPmsUser, type CurrentPmsUser } from "@/lib/pms-auth";
import { pmsCan } from "@/lib/pms-access";

/** Page guard for a SprintOS section: the signed-in user when they hold `key`; otherwise the polite locked page (the menu already hides what a person cannot use). */
export async function pmsPage(key: string | string[], feature: string): Promise<{ user: CurrentPmsUser; locked: null } | { user: null; locked: ReactNode }> {
  const user = await getCurrentPmsUser();
  if (!user) redirect("/sprintos/login");
  if (!(Array.isArray(key) ? key : [key]).some((k) => pmsCan(user, k))) return { user: null, locked: <ProductLocked product="sprintos" feature={feature} /> };
  return { user, locked: null };
}
