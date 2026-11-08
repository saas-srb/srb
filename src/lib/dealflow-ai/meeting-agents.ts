import "server-only";
import { getBot, kindOf, type BotDoc } from "@/lib/products/agentos/bots";
import { getBotFileText, listBotFiles, type KbFileDoc } from "@/lib/products/agentos/knowledge";
import type { BotColor, BotIcon } from "@/lib/products/agentos/constants";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import type { PersonaFields } from "@/lib/products/agentos/voice/prompt";

/**
 * Meeting agents are AgentOS voice agents (bots with kind "voice"). A meeting stores only their ids; everything shown or spoken
 * (name, role, voice, instructions, knowledge) is read from the AgentOS row at the time it is needed, so editing an agent in
 * AgentOS changes the next meeting and a removed agent degrades to "Agent no longer available" instead of breaking the room.
 */

/** What the room needs to render an agent (client-safe: no instructions or knowledge). */
export interface MeetingAgentView {
  id: string;
  /** False when the AgentOS agent was deleted, deactivated or is no longer a usable voice agent. */
  available: boolean;
  name: string;
  role: string;
  icon: BotIcon | null;
  color: BotColor | null;
  voiceName: string;
  /** The agent's photo route, or null (the room draws icon + colour). */
  avatarUrl?: string | null;
  /** Names people may call it by besides `name`: the persona display name set in AgentOS. */
  callNames?: string[];
}

/** What the speech path needs (server only). */
export interface MeetingAgentSpeech extends MeetingAgentView {
  voiceId: string;
  instructions: string;
  knowledge: string;
  /** Persona and language from the agent's AgentOS voice block. */
  persona: PersonaFields;
  language: string;
}

/** The agent ids of a meeting: the agent participants of the roster (new model), else the legacy `agentIds` list. */
export function meetingAgentIds(meeting: unknown): string[] {
  const m = meeting as { participants?: Array<{ kind?: string; refId?: string | null }>; agentIds?: string[] } | null;
  if (!m) return [];
  if (Array.isArray(m.participants)) return m.participants.filter((p) => p.kind === "agent" && typeof p.refId === "string" && p.refId).map((p) => p.refId as string);
  return Array.isArray(m.agentIds) ? m.agentIds : [];
}

export const UNAVAILABLE_AGENT_NAME = "Agent no longer available";

const KNOWLEDGE_MAX_CHARS = 24000;
const KNOWLEDGE_TTL_MS = 5 * 60 * 1000;

export interface MeetingAgentDeps {
  getBot?: (id: string) => Promise<BotDoc | null>;
  knowledge?: (bot: BotDoc) => Promise<string>;
  /** Overrides for the default knowledge loader (tests). */
  listFiles?: typeof listBotFiles;
  fileText?: (bot: BotDoc, fileId: string) => Promise<{ text: string }>;
}

function usable(bot: BotDoc | null): bot is BotDoc & { voice: NonNullable<BotDoc["voice"]> } {
  return !!bot && !bot.deletedAt && bot.status === "active" && kindOf(bot) === "voice" && !!bot.voice?.voiceId;
}

function view(id: string, bot: BotDoc | null): MeetingAgentView {
  if (!usable(bot)) return { id, available: false, name: UNAVAILABLE_AGENT_NAME, role: "", icon: null, color: null, voiceName: "" };
  const display = bot.voice.displayName?.trim();
  return {
    id,
    available: true,
    name: bot.name,
    role: bot.voice.jobTitle?.trim() || bot.category || bot.description,
    icon: bot.icon,
    color: bot.color,
    voiceName: bot.voice.voiceName,
    avatarUrl: avatarUrlFor(bot._id, bot.avatarKey),
    callNames: display && display.toLowerCase() !== bot.name.toLowerCase() ? [display] : [],
  };
}

/** The meeting's agents in the order they were chosen. Ids that no longer resolve come back as unavailable (never throw, never dropped). */
export async function resolveMeetingAgents(agentIds: string[], deps: MeetingAgentDeps = {}): Promise<MeetingAgentView[]> {
  const load = deps.getBot ?? getBot;
  return Promise.all(agentIds.map(async (id) => view(id, await load(id).catch(() => null))));
}

const knowledgeCache = new Map<string, { at: number; text: string }>();

/** Identifies the exact set of files that feed an agent's knowledge: any add, remove, toggle, re-upload or reprocess changes it. */
export function knowledgeSignature(files: Pick<KbFileDoc, "_id" | "enabled" | "status" | "version" | "updatedAt" | "size">[]): string {
  return files
    .filter((f) => f.enabled && f.status === "ready")
    .map((f) => `${f._id}.${f.version}.${f.size}.${f.updatedAt instanceof Date ? f.updatedAt.getTime() : String(f.updatedAt)}`)
    .sort()
    .join("|");
}

export function clearKnowledgeCache(): void {
  knowledgeCache.clear();
}

async function defaultKnowledge(bot: BotDoc, deps: MeetingAgentDeps = {}): Promise<string> {
  const files = await (deps.listFiles ?? listBotFiles)(bot._id);
  const key = `${bot._id}:${knowledgeSignature(files)}`;
  const hit = knowledgeCache.get(key);
  if (hit && Date.now() - hit.at < KNOWLEDGE_TTL_MS) return hit.text;
  const read = deps.fileText ?? ((b: BotDoc, id: string) => getBotFileText(b, id));
  let text = "";
  for (const f of files) {
    if (!f.enabled || f.status !== "ready" || text.length >= KNOWLEDGE_MAX_CHARS) continue;
    try {
      const { text: body } = await read(bot, f._id);
      if (body.trim()) text += `${text ? "\n\n" : ""}## ${f.title}\n${body.trim()}`;
    } catch {
      /* an unreadable file is skipped; the agent still has its instructions */
    }
  }
  text = text.slice(0, KNOWLEDGE_MAX_CHARS);
  // Entries for older file sets of this agent can never be hit again.
  for (const k of knowledgeCache.keys()) if (k.startsWith(`${bot._id}:`) && k !== key) knowledgeCache.delete(k);
  knowledgeCache.set(key, { at: Date.now(), text });
  return text;
}

export type SpeechAgentResult = { ok: true; agent: MeetingAgentSpeech } | { ok: false; status: number; error: string };

/**
 * The agent a live meeting may speak as. The meeting must exist, be live (started by the host) and list this agent; nothing the browser sends
 * (voice, instructions, knowledge) is trusted. The room is also joined by clients without an account, so access is the meeting itself.
 */
export async function getAgentForSpeech(roomId: string, agentId: string, deps: MeetingAgentDeps = {}): Promise<SpeechAgentResult> {
  const meeting = await getMeeting(roomId);
  if (!meeting) return { ok: false, status: 404, error: "Meeting not found" };
  if (meeting.status === "ended" || meeting.status === "cancelled") return { ok: false, status: 409, error: "This meeting is over." };
  // The host opens the room (their join marks it live); until then nobody, including a guest with the link, can make an agent speak.
  if (meeting.status !== "live") return { ok: false, status: 409, error: "The host hasn't started this meeting yet." };
  if (!meetingAgentIds(meeting).includes(agentId)) return { ok: false, status: 403, error: "This agent is not part of the meeting." };
  const bot = await (deps.getBot ?? getBot)(agentId).catch(() => null);
  if (!usable(bot)) return { ok: false, status: 410, error: UNAVAILABLE_AGENT_NAME };
  const knowledge = await (deps.knowledge ?? ((b) => defaultKnowledge(b, deps)))(bot).catch(() => "");
  return { ok: true, agent: { ...view(agentId, bot), voiceId: bot.voice.voiceId, instructions: bot.instructions, knowledge, persona: { displayName: bot.voice.displayName, jobTitle: bot.voice.jobTitle, toneNote: bot.voice.toneNote, disclosureLine: bot.voice.disclosureLine }, language: bot.voice.language || "en" } };
}

export class MeetingAgentError extends Error {}

export const MAX_MEETING_AGENTS = 6;

/** Keeps the ids the scheduler may attach: unique strings that are in `allowed` (the active voice agents the user can use). */
export function pickMeetingAgentIds(raw: unknown, allowed: ReadonlySet<string>): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) throw new MeetingAgentError("agentIds must be a list of agent ids.");
  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_MEETING_AGENTS) throw new MeetingAgentError(`A meeting can have at most ${MAX_MEETING_AGENTS} AI agents.`);
  const bad = ids.find((id) => !allowed.has(id));
  if (bad) throw new MeetingAgentError("One of the selected agents is no longer available. Refresh and pick again.");
  return ids;
}
