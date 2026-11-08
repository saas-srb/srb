/** Pure builders for the "Try it" panels (client-safe, unit-tested). Nothing here touches a network or a database. */
import { composeVoicePrompt, type PersonaFields } from "@/lib/products/agentos/voice/prompt";

export interface PreviewTurn {
  role: "user" | "assistant";
  text: string;
}

export interface PreviewDraft {
  instructions: string;
  model: string;
  /** null = the model default. */
  temperature: number | string | null;
}

/** The exact Responses API request a text preview sends: stateless (`store: false`), no conversation, optional file_search on the agent's own store. */
export function buildPreviewRequest(i: { draft: PreviewDraft; turns: PreviewTurn[]; maxOutputTokens: number; vectorStoreId: string | null; systemInstructions: string }) {
  const t = i.draft.temperature === null || i.draft.temperature === "" ? null : Number(i.draft.temperature);
  return {
    model: i.draft.model,
    instructions: i.systemInstructions,
    input: i.turns.map((x) => ({ role: x.role, content: x.text })),
    max_output_tokens: i.maxOutputTokens,
    store: false as const,
    ...(t !== null && Number.isFinite(t) && t >= 0 && t <= 2 ? { temperature: t } : {}),
    ...(i.vectorStoreId ? { tools: [{ type: "file_search" as const, vector_store_ids: [i.vectorStoreId], max_num_results: 8 }], tool_choice: { type: "file_search" as const } } : {}),
  };
}

export interface VoiceDraft extends PersonaFields {
  instructions: string;
  firstMessage: string;
  language: string;
  voiceId: string;
}

/** ElevenLabs per-conversation overrides for a draft test call (SDK shape). The prompt always carries the honesty rule. */
export function buildVoicePreviewOverrides(d: VoiceDraft) {
  return {
    agent: {
      prompt: { prompt: composeVoicePrompt(d.instructions, d) },
      ...(d.firstMessage.trim() ? { firstMessage: d.firstMessage.trim() } : {}),
      language: d.language,
    },
    tts: { voiceId: d.voiceId },
  };
}

/** "What the agent will say first", for the form. `spoken` is null when the caller speaks first. */
export function describeOpening(d: Pick<VoiceDraft, "firstMessage" | "disclosureLine" | "displayName" | "jobTitle">): { spoken: string | null; disclosure: string | null; who: string | null } {
  const spoken = d.firstMessage.trim() || null;
  const disclosure = d.disclosureLine?.trim() || null;
  const who = [d.displayName?.trim(), d.jobTitle?.trim()].filter(Boolean).join(" - ") || null;
  return { spoken, disclosure, who };
}

export const SAMPLE_TEXT_MAX = 300;
