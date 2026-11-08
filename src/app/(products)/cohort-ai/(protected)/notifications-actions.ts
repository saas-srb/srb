"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { markRead, markAllRead } from "@/lib/products/cohort-ai/notifications";

export async function markTmsNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentTmsUser();
  if (!user) return { ok: false };
  await markRead(ids, user.id);
  revalidatePath("/cohort-ai/notifications");
  return { ok: true };
}

export async function markAllTmsNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentTmsUser();
  if (!user) return { ok: false };
  await markAllRead(user.id);
  revalidatePath("/cohort-ai/notifications");
  return { ok: true };
}
