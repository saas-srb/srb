"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { markRead, markAllRead } from "@/lib/products/spendiq/notifications";

export async function markPrmsNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentPrmsUser();
  if (!user) return { ok: false };
  await markRead(ids, user.id);
  revalidatePath("/spendiq/notifications");
  return { ok: true };
}

export async function markAllPrmsNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentPrmsUser();
  if (!user) return { ok: false };
  await markAllRead(user.id);
  revalidatePath("/spendiq/notifications");
  return { ok: true };
}
