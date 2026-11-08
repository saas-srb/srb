"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { goOffline } from "@/lib/products/huddle-ai/presence";
import { markRead, markAllRead } from "@/lib/products/huddle-ai/notifications";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just Messenger's own), on every device — see `cross-module-sso.ts`.
 */
export async function messengerLogoutAction(): Promise<void> {
  const user = await getCurrentChatUser();
  if (user) {
    await goOffline(user.id).catch(() => {});
    if (ObjectId.isValid(user.id)) {
      await signOutThisDevice(new ObjectId(user.id));
    }
  }
  redirect("/commandos/login");
}

export async function markNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentChatUser();
  if (!user) return { ok: false };
  await markRead(ids, user.id);
  revalidatePath("/huddle-ai/notifications");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentChatUser();
  if (!user) return { ok: false };
  await markAllRead(user.id);
  revalidatePath("/huddle-ai/notifications");
  return { ok: true };
}
