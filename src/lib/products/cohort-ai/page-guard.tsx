import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentTmsUser, type CurrentTmsUser } from "@/lib/tms-auth";
import { tmsCan } from "@/lib/tms-access";

/** Page guard for a CohortAI section: the signed-in user when they hold `key` (or any of them); otherwise the polite locked page (the menu already hides what a person cannot use). */
export async function tmsPage(key: string | string[], feature: string): Promise<{ user: CurrentTmsUser; locked: null } | { user: null; locked: ReactNode }> {
  const user = await getCurrentTmsUser();
  if (!user) redirect("/cohort-ai/login");
  if (!(Array.isArray(key) ? key : [key]).some((k) => tmsCan(user, k))) return { user: null, locked: <ProductLocked product="cohort-ai" feature={feature} /> };
  return { user, locked: null };
}
