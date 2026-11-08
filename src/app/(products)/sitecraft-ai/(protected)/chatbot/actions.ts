"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aiBlockReason, isBillingLimitError } from "@/lib/platform/billing/enforce";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { deleteConversation, bulkDeleteConversations } from "@/lib/chat-conversations";
import {
  updateChatbotConfig,
  validateChatbotConfig,
  type ChatbotConfigInput,
} from "@/lib/chatbot-config";
import { isOpenAIConfigured } from "@/lib/openai";
import { beginWebsiteIndex, chatbotCrawlBaseOverride, runWebsiteIndex, urlsForPageIds } from "@/lib/kb-website";
import { reindexPdf, deletePdf } from "@/lib/kb-pdf";
import { deleteVoiceConversation, bulkDeleteVoiceConversations } from "@/lib/voice-conversations";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { afterForCompany } from "@/lib/platform/tenancy/context";

// Every action re-checks the session — render-time gating on the page alone
// is not a security boundary for the action endpoint.
async function requireLmsUser() {
  const u = await requireLmsOrCms("MANAGE_CHATBOT");
  if (!u) throw new Error("Forbidden");
  return u;
}

async function crawlBaseUrl(): Promise<string> {
  return (await chatbotCrawlBaseOverride()) ?? (await companySiteUrl());
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function deleteConversationAction(id: string): Promise<void> {
  await requireLmsUser();
  await deleteConversation(id);
  revalidatePath("/commandos/chatbot/conversations");
  revalidatePath("/commandos/chatbot");
  redirect("/commandos/chatbot/conversations");
}

export async function deleteConversationInPlaceAction(id: string): Promise<{ error?: string }> {
  await requireLmsUser();
  const ok = await deleteConversation(id);
  if (!ok) return { error: "Conversation not found." };
  revalidatePath("/commandos/chatbot/conversations");
  revalidatePath("/commandos/chatbot");
  return {};
}

export async function bulkDeleteConversationsAction(ids: string[]): Promise<{ deleted: number }> {
  await requireLmsUser();
  const deleted = await bulkDeleteConversations(ids);
  revalidatePath("/commandos/chatbot/conversations");
  revalidatePath("/commandos/chatbot");
  return { deleted };
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export async function triggerWebsiteIndexAction(mode: "full" | "incremental"): Promise<{ runId?: string; error?: string }> {
  const lmsUser = await requireLmsUser();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  const incremental = mode === "incremental";
  const { runId, logger } = await beginWebsiteIndex({ triggeredBy: lmsUser.email, incremental });
  const baseUrl = await crawlBaseUrl();
  await afterForCompany(() => runWebsiteIndex(logger, { baseUrl, incremental, triggeredBy: lmsUser.email }));
  revalidatePath("/commandos/chatbot/knowledge-base");
  return { runId };
}

export async function reindexPagesAction(pageIds: string[]): Promise<{ runId?: string; error?: string }> {
  const lmsUser = await requireLmsUser();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  const urls = await urlsForPageIds(pageIds);
  if (urls.length === 0) return { error: "No matching pages selected." };
  const { runId, logger } = await beginWebsiteIndex({ triggeredBy: lmsUser.email, onlyUrls: urls });
  const baseUrl = await crawlBaseUrl();
  await afterForCompany(() =>
    runWebsiteIndex(logger, { baseUrl, onlyUrls: urls, triggeredBy: lmsUser.email })
  );
  revalidatePath("/commandos/chatbot/knowledge-base");
  return { runId };
}

export async function reindexPdfAction(id: string): Promise<{ error?: string }> {
  const lmsUser = await requireLmsUser();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  let ok = false;
  try {
    ok = await reindexPdf(id, lmsUser.email);
  } catch (err) {
    if (isBillingLimitError(err)) return { error: err.message };
    throw err;
  }
  if (!ok) return { error: "Document not found." };
  revalidatePath("/commandos/chatbot/knowledge-base");
  return {};
}

export async function deletePdfAction(id: string): Promise<{ error?: string }> {
  await requireLmsUser();
  const ok = await deletePdf(id);
  if (!ok) return { error: "Document not found." };
  revalidatePath("/commandos/chatbot/knowledge-base");
  return {};
}

// ---------------------------------------------------------------------------
// AI configuration
// ---------------------------------------------------------------------------

export async function saveChatbotConfigAction(
  input: ChatbotConfigInput
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const lmsUser = await requireLmsUser();
  const validation = validateChatbotConfig(input);
  if (!validation.valid) {
    return { error: "Please fix the highlighted fields.", fieldErrors: validation.errors };
  }
  await updateChatbotConfig(validation.data, lmsUser.email);
  revalidatePath("/commandos/chatbot/config");
  revalidatePath("/commandos/chatbot");
  return {};
}

// ---------------------------------------------------------------------------
// Conversation AI (voice)
// ---------------------------------------------------------------------------

export async function saveVoiceConfigAction(
  voice: unknown
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const lmsUser = await requireLmsUser();
  const validation = validateChatbotConfig({ voice });
  if (!validation.valid) {
    return { error: validation.errors.voice ?? "Please fix the highlighted fields.", fieldErrors: validation.errors };
  }
  await updateChatbotConfig(validation.data, lmsUser.email);
  revalidatePath("/commandos/chatbot/voice/config");
  revalidatePath("/commandos/chatbot/voice");
  return {};
}

export async function deleteVoiceConversationAction(id: string): Promise<void> {
  await requireLmsUser();
  await deleteVoiceConversation(id);
  revalidatePath("/commandos/chatbot/voice-conversations");
  revalidatePath("/commandos/chatbot/voice");
  redirect("/commandos/chatbot/voice-conversations");
}

export async function deleteVoiceConversationInPlaceAction(id: string): Promise<{ error?: string }> {
  await requireLmsUser();
  const ok = await deleteVoiceConversation(id);
  if (!ok) return { error: "Conversation not found." };
  revalidatePath("/commandos/chatbot/voice-conversations");
  revalidatePath("/commandos/chatbot/voice");
  return {};
}

export async function bulkDeleteVoiceConversationsAction(ids: string[]): Promise<{ deleted: number }> {
  await requireLmsUser();
  const deleted = await bulkDeleteVoiceConversations(ids);
  revalidatePath("/commandos/chatbot/voice-conversations");
  revalidatePath("/commandos/chatbot/voice");
  return { deleted };
}
