import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import ProductLocked from "@/components/products/common/ProductLocked";
import { getCurrentSopUser, type CurrentSopUser } from "@/lib/sop-auth";
import { pbCan } from "@/lib/playbook-access";

/** Page guard for a Playbook section: the signed-in user when they hold `key`; otherwise the polite locked page (the menu already hides what a person cannot use). */
export async function pbPage(key: string | string[], feature: string): Promise<{ user: CurrentSopUser; locked: null } | { user: null; locked: ReactNode }> {
  const user = await getCurrentSopUser();
  if (!user) redirect("/playbook-ai/login");
  if (!(Array.isArray(key) ? key : [key]).some((k) => pbCan(user, k))) return { user: null, locked: <ProductLocked product="playbook-ai" feature={feature} /> };
  return { user, locked: null };
}
