"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireChatbotManageAction } from "../access";
import { deleteVoiceConversation, bulkDeleteVoiceConversations } from "@/lib/voice-conversations";

function revalidate() {
  revalidatePath("/commandos/chatbot/voice-conversations");
}

export async function deleteVoiceConversationAction(id: string): Promise<{ ok: boolean }> {
  await requireChatbotManageAction();
  const ok = await deleteVoiceConversation(id);
  if (ok) revalidate();
  return { ok };
}

export async function deleteVoiceConversationAndRedirectAction(id: string): Promise<never> {
  await requireChatbotManageAction();
  await deleteVoiceConversation(id);
  revalidatePath("/commandos/chatbot/voice-conversations");
  revalidatePath("/commandos/chatbot/voice");
  redirect("/commandos/chatbot/voice-conversations");
}

export async function bulkDeleteVoiceConversationsAction(ids: string[]): Promise<{ deleted: number }> {
  await requireChatbotManageAction();
  const deleted = await bulkDeleteVoiceConversations(ids);
  revalidate();
  return { deleted };
}
