import "server-only";
import { isOpenAIConfigured } from "@/lib/openai";
import { citationTitles } from "@/lib/products/agentos/engine";
import { friendlyError } from "@/lib/products/agentos/knowledge";
import { loadTranscript, type ChatDoc } from "@/lib/products/agentos/chats";
import type { WorkspaceMessage } from "@/components/products/agentos/ChatWorkspace";

/** Reads a chat's transcript back from its OpenAI Conversation and shapes it for the workspace. */
export async function workspaceMessages(chat: ChatDoc): Promise<{ messages: WorkspaceMessage[]; error: string | null }> {
  if (!(await isOpenAIConfigured())) return { messages: [], error: "OpenAI isn't connected for this workspace (Settings → Integrations), so this chat's history can't be loaded." };
  if (!chat.conversationId && chat.turns > 0) {
    return { messages: [], error: "This chat's earlier messages aren't available (it was created without an OpenAI conversation, e.g. as demo data). New messages start a fresh conversation." };
  }
  try {
    const transcript = await loadTranscript(chat);
    const allCited = [...new Set(transcript.flatMap((m) => m.citedFileIds))];
    const titles = new Map((await citationTitles(chat.botId, allCited)).map((c) => [c.fileId, c.title]));
    return {
      messages: transcript.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        attachments: m.attachments,
        citations: [...new Set(m.citedFileIds.map((id) => titles.get(id) ?? "Knowledge base document"))],
      })),
      error: null,
    };
  } catch (err) {
    console.error("[aibots] transcript load failed", friendlyError(err));
    return { messages: [], error: "This chat's history couldn't be loaded from OpenAI right now. New messages still continue the same conversation." };
  }
}
