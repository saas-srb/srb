"use server";

import { redirect } from "next/navigation";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { chatCan } from "@/lib/messenger-access";
import { getOrCreateDirect } from "@/lib/products/huddle-ai/conversations";
import { togglePinnedConversation } from "@/lib/products/huddle-ai/users";
import { revalidatePath } from "next/cache";

export async function startDirectMessageAction(otherUserId: string): Promise<{ error: string } | never> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  if (!chatCan(user, "messages.send")) return { error: "You don't have permission to start conversations." };
  const result = await getOrCreateDirect({ id: user.id, roles: user.roles }, otherUserId);
  if (!result.ok) return { error: result.error };
  redirect(`/huddle-ai/dm/${result.conversation._id}`);
}

export async function togglePinConversationAction(conversationId: string): Promise<{ pinned: boolean }> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");
  if (!chatCan(user, "dm.view")) throw new Error("Forbidden");
  const pinned = await togglePinnedConversation(user.id, conversationId);
  revalidatePath("/huddle-ai/dm", "layout");
  return { pinned };
}
