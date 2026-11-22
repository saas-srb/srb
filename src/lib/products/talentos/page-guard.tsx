import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";

/**
 * Page guard for a TalentOS section: the signed-in user when they hold `key`; otherwise the polite locked page, shown inside the product's own shell
 * (the menu already hides what a person cannot use, so this is only what a typed address shows).
 */
export async function hrPage(key: string, feature: string): Promise<{ user: CurrentHrmsUser; locked: null } | { user: null; locked: ReactNode }> {
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos/login");
  if (!hrCan(user, key)) return { user: null, locked: <ProductLocked product="talentos" feature={feature} /> };
  return { user, locked: null };
}
