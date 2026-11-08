"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { markRead, markAllRead } from "@/lib/products/sprintos/notifications";

export async function markNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentPmsUser();
  if (!user) return { ok: false };
  await markRead(ids, user.id);
  revalidatePath("/sprintos/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentPmsUser();
  if (!user) return { ok: false };
  await markAllRead(user.id);
  revalidatePath("/sprintos/notifications");
  return { ok: true };
}
