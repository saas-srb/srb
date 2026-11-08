"use server";

import { redirect } from "next/navigation";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getOrCreateDirect } from "@/lib/products/huddle-ai/conversations";
import { togglePinnedConversation } from "@/lib/products/huddle-ai/users";
import { revalidatePath } from "next/cache";

export async function startDirectMessageAction(otherUserId: string): Promise<{ error: string } | never> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  const result = await getOrCreateDirect({ id: user.id, roles: user.roles }, otherUserId);
  if (!result.ok) return { error: result.error };
  redirect(`/huddle-ai/dm/${result.conversation._id}`);
}

export async function togglePinConversationAction(conversationId: string): Promise<{ pinned: boolean }> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");
  const pinned = await togglePinnedConversation(user.id, conversationId);
  revalidatePath("/huddle-ai/dm", "layout");
  return { pinned };
}
