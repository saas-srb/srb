"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireChatbotManageAction } from "../access";
import { deleteConversation, bulkDeleteConversations } from "@/lib/chat-conversations";

function revalidate() {
  revalidatePath("/commandos/chatbot/conversations");
}

export async function deleteConversationAction(id: string): Promise<{ ok: boolean }> {
  await requireChatbotManageAction();
  const ok = await deleteConversation(id);
  if (ok) revalidate();
  return { ok };
}

export async function deleteConversationAndRedirectAction(id: string): Promise<never> {
  await requireChatbotManageAction();
  await deleteConversation(id);
  revalidatePath("/commandos/chatbot/conversations");
  revalidatePath("/commandos/chatbot");
  redirect("/commandos/chatbot/conversations");
}

export async function bulkDeleteConversationsAction(ids: string[]): Promise<{ deleted: number }> {
  await requireChatbotManageAction();
  const deleted = await bulkDeleteConversations(ids);
  revalidate();
  return { deleted };
}
