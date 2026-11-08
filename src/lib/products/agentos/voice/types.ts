/**
 * Shared contract for AgentOS agents of kind "voice". A voice agent is a bot row (same collection, same Hub, same access list)
 * whose `voice` block describes the live ElevenLabs Conversational AI agent that speaks for it. Nothing here is a default
 * persona: every value is entered by the company in the agent form or picked from the company's own ElevenLabs account.
 */
import type { DataField } from "@/lib/products/agentos/calls/purposes";

export type { DataField };
export type AgentKind = "text" | "voice";

export interface VoiceConfig {
  /** ElevenLabs voice id, picked from the company's own voice list (never hardcoded). */
  voiceId: string;
  voiceName: string;
  /** Language code the agent speaks (ElevenLabs language ids, e.g. "en", "hi"); chosen from ElevenLabs' supported list. */
  language: string;
  /** What the agent says first when the call connects. */
  firstMessage: string;
  /** Persona (the agent joins calls and meetings as a named team member). All optional; the honesty rule in prompt.ts applies regardless. */
  displayName?: string;
  jobTitle?: string;
  toneNote?: string;
  /** Optional company-written line the agent says early on. */
  disclosureLine?: string;
  /** Seconds of conversation after which the call ends (null = ElevenLabs default). */
  maxDurationSecs: number | null;
  /** The id of the agent on ElevenLabs once synced; null until the first successful sync. */
  elevenAgentId: string | null;
  /** Last successful sync with ElevenLabs, and the last sync error shown to the editor (null when fine). */
  syncedAt: Date | null;
  syncError: string | null;
  /** Call purposes this agent can be used for (keys of calls/purposes.ts). Absent on agents saved before calling existed. */
  purposes?: string[];
  /** What to collect from each call (maps to ElevenLabs data collection). Edited by the company. */
  dataFields?: DataField[];
  /** Listed on the company's public website directory (nothing is public unless this is on). */
  isPublic?: boolean;
  /** Website origins (https://example.com) allowed to open this agent publicly. */
  allowedOrigins?: string[];
  /** When the ElevenLabs agent was last confirmed to have every per-conversation override OFF (set by the sync for a public agent; null otherwise). */
  overridesLockedAt?: Date | null;
  /** ElevenLabs knowledge-base document ids created from this agent's knowledge, so a re-sync can replace them. */
  knowledgeDocIds: string[];
}

export interface VoiceConversationSummary {
  conversationId: string;
  agentId: string;
  startedAt: string;
  durationSecs: number | null;
  status: string;
  transcript: { role: "agent" | "user"; text: string; atSecs: number | null }[] | null;
}
