"use server";

import { revalidatePath } from "next/cache";
import { aiBlockReason, isBillingLimitError } from "@/lib/platform/billing/enforce";
import { requireChatbotManageAction } from "./access";
import { updateChatbotConfig, validateChatbotConfig, type ChatbotConfigInput } from "@/lib/chatbot-config";
import { isOpenAIConfigured } from "@/lib/openai";
import { beginWebsiteIndex, chatbotCrawlBaseOverride, runWebsiteIndex, urlsForPageIds } from "@/lib/kb-website";
import { reindexPdf, deletePdf } from "@/lib/kb-pdf";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { afterForCompany } from "@/lib/platform/tenancy/context";

async function crawlBaseUrl(): Promise<string> {
  return (await chatbotCrawlBaseOverride()) ?? (await companySiteUrl());
}

export async function triggerWebsiteIndexAction(
  mode: "full" | "incremental"
): Promise<{ runId?: string; error?: string }> {
  const user = await requireChatbotManageAction();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  const incremental = mode === "incremental";
  const { runId, logger } = await beginWebsiteIndex({ triggeredBy: user.email, incremental });
  const baseUrl = await crawlBaseUrl();
  await afterForCompany(() => runWebsiteIndex(logger, { baseUrl, incremental, triggeredBy: user.email }));
  revalidatePath("/commandos/chatbot/knowledge-base");
  return { runId };
}

export async function reindexPagesAction(pageIds: string[]): Promise<{ runId?: string; error?: string }> {
  const user = await requireChatbotManageAction();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  const urls = await urlsForPageIds(pageIds);
  if (urls.length === 0) return { error: "No matching pages selected." };
  const { runId, logger } = await beginWebsiteIndex({ triggeredBy: user.email, onlyUrls: urls });
  const baseUrl = await crawlBaseUrl();
  await afterForCompany(() => runWebsiteIndex(logger, { baseUrl, onlyUrls: urls, triggeredBy: user.email }));
  revalidatePath("/commandos/chatbot/knowledge-base");
  return { runId };
}

export async function reindexPdfAction(id: string): Promise<{ error?: string }> {
  const user = await requireChatbotManageAction();
  if (!(await isOpenAIConfigured())) return { error: "OpenAI isn't connected. Add your key in CommandOS → Settings → Integrations." };
  const aiBlock = await aiBlockReason();
  if (aiBlock) return { error: aiBlock };
  let ok = false;
  try {
    ok = await reindexPdf(id, user.email);
  } catch (err) {
    if (isBillingLimitError(err)) return { error: err.message };
    throw err;
  }
  if (!ok) return { error: "Document not found." };
  revalidatePath("/commandos/chatbot/knowledge-base");
  return {};
}

export async function deletePdfAction(id: string): Promise<{ error?: string }> {
  await requireChatbotManageAction();
  const ok = await deletePdf(id);
  if (!ok) return { error: "Document not found." };
  revalidatePath("/commandos/chatbot/knowledge-base");
  return {};
}

export async function saveChatbotConfigAction(
  input: ChatbotConfigInput
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireChatbotManageAction();
  const validation = validateChatbotConfig(input);
  if (!validation.valid) return { error: "Please fix the highlighted fields.", fieldErrors: validation.errors };
  await updateChatbotConfig(validation.data, user.email);
  revalidatePath("/commandos/chatbot/config");
  revalidatePath("/commandos/chatbot");
  return {};
}

export async function saveVoiceConfigAction(
  voice: unknown
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireChatbotManageAction();
  const validation = validateChatbotConfig({ voice });
  if (!validation.valid) {
    return { error: validation.errors.voice ?? "Please fix the highlighted fields.", fieldErrors: validation.errors };
  }
  await updateChatbotConfig(validation.data, user.email);
  revalidatePath("/commandos/chatbot/voice/config");
  revalidatePath("/commandos/chatbot/voice");
  return {};
}
