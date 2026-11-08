import { ATTACHMENT_MARKER } from "@/lib/products/agentos/constants";
import { CONTEXT_NOTES_MAX } from "@/lib/products/agentos/calls/context";

/**
 * Starting a call from inside a text chat. Pure helpers (no I/O) so they are testable and safe for client and server:
 * the opt-in context hand-off, and the plain reasons the Call / Talk here buttons are unavailable.
 *
 * Privacy rule: the only thing placed in the call notes by default is a line naming the chat. Message text is added only when the
 * person ticks "Share a short summary", and then it is shown in the editable notes box before anything is sent.
 */

export const CHAT_SUMMARY_MESSAGES = 6;
const PER_MESSAGE_MAX = 140;
const TITLE_MAX = 70;

/** One line of text with control characters, template braces, angle brackets and backticks removed. */
function oneLine(v: string, max: number): string {
  const s = v
    .replace(ATTACHMENT_MARKER, " ")
    .normalize("NFKC")
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[{}<>\x60]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** "Continuing from a chat titled <title>." The default notes for a call placed from a chat. */
export function chatContextLine(title: string | null | undefined): string {
  const t = oneLine(title ?? "", TITLE_MAX);
  return t ? `Continuing from a chat titled ${t}.` : "Continuing from a chat.";
}

export interface SummarySource {
  role: "user" | "assistant";
  text: string;
  /** Ignored on purpose: attachments are never shared. */
  attachments?: string[];
}

/**
 * A bounded extractive summary of the latest messages (no AI call): the newest messages that fit, oldest first, each cut to a short
 * snippet. The result plus the context line never exceeds the call-notes limit. Returns "" when there is nothing to share.
 */
export function buildChatSummary(messages: readonly SummarySource[], title: string | null | undefined, limit = CONTEXT_NOTES_MAX): string {
  return summarize(messages, chatContextLine(title), { user: "Person", assistant: "Agent" }, limit);
}

/** The same bounded summary for any context line and speaker names (used by threads that are not AgentOS chats). */
function summarize(messages: readonly SummarySource[], contextLine: string, names: { user: string; assistant: string }, limit: number): string {
  const budget = limit - contextLine.length - 1;
  const prefix = "Recent messages: ";
  if (budget <= prefix.length + 10) return "";
  const picked: string[] = [];
  let used = prefix.length;
  const recent = messages.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-CHAT_SUMMARY_MESSAGES);
  for (let i = recent.length - 1; i >= 0; i--) {
    const text = oneLine(recent[i].text, PER_MESSAGE_MAX);
    if (!text) continue;
    const piece = `${recent[i].role === "user" ? names.user : names.assistant}: ${text}`;
    const cost = piece.length + (picked.length ? 3 : 0);
    if (used + cost > budget) {
      if (picked.length === 0) {
        // Even the newest message doesn't fit whole: keep what does.
        const room = budget - used - 1;
        if (room > 20) picked.unshift(`${piece.slice(0, room).trimEnd()}…`);
      }
      break;
    }
    picked.unshift(piece);
    used += cost;
  }
  return picked.length ? `${prefix}${picked.join(" | ")}` : "";
}

/** The full notes text: context line, plus the summary only when the person opted in. */
export function chatCallNotes(title: string | null | undefined, messages: readonly SummarySource[], shareSummary: boolean): string {
  const line = chatContextLine(title);
  if (!shareSummary) return line;
  const summary = buildChatSummary(messages, title);
  return summary ? `${line} ${summary}` : line;
}

export type ThreadChannel = "chat" | "email" | "whatsapp";
const CHANNEL_WORD: Record<ThreadChannel, string> = { chat: "chat", email: "email", whatsapp: "WhatsApp" };

/** "Continuing from a <channel> conversation with <name>." The default notes for a call placed from a DealFlow chat, email or WhatsApp thread. */
export function threadContextLine(channel: ThreadChannel, personName: string | null | undefined): string {
  const name = oneLine(personName ?? "", TITLE_MAX);
  return name ? `Continuing from a ${CHANNEL_WORD[channel]} conversation with ${name}.` : `Continuing from a ${CHANNEL_WORD[channel]} conversation.`;
}

/** Opt-in summary of the latest messages of a person's thread. `mine` = written by the team. Same sanitising and bound as the chat summary. */
export function buildThreadSummary(channel: ThreadChannel, personName: string | null | undefined, messages: readonly { mine: boolean; text: string }[], limit = CONTEXT_NOTES_MAX): string {
  return summarize(messages.map((m) => ({ role: m.mine ? ("assistant" as const) : ("user" as const), text: m.text })), threadContextLine(channel, personName), { user: oneLine(personName ?? "", 30) || "Person", assistant: "Team" }, limit);
}

export function chatTarget(chatId: string, title: string | null | undefined) {
  return { product: "agentos", entityType: "chat", entityId: chatId, label: oneLine(title ?? "", 120) || "this chat" };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface ChatCallFacts {
  /** The chat row exists (the first message was sent). */
  chatCreated: boolean;
  /** Null while the calling options are still loading. */
  options: { canCall: boolean; blockers: { code: string }[]; agents: { ready: boolean }[] } | null;
}

export interface Availability {
  enabled: boolean;
  /** Plain sentence shown when disabled (and while loading). */
  reason: string | null;
}

const FIRST = "Send your first message to enable calling from this chat.";
const LOADING = "Checking what calling options you have…";

export function phoneCallAvailability(f: ChatCallFacts): Availability {
  if (!f.chatCreated) return { enabled: false, reason: FIRST };
  if (!f.options) return { enabled: false, reason: LOADING };
  const o = f.options;
  if (!o.canCall) return { enabled: false, reason: "You don't have permission to place calls. Ask an admin to allow \"Place voice calls\" for you." };
  if (o.agents.length === 0) return { enabled: false, reason: "There is no voice agent you can use yet. Ask an editor to create one and give you access." };
  if (!o.agents.some((a) => a.ready)) return { enabled: false, reason: "None of your voice agents is ready to call yet." };
  if (o.blockers.some((b) => b.code === "no_number")) return { enabled: false, reason: "No phone number is set up for outbound calls yet. Ask an admin to add one." };
  return { enabled: true, reason: null };
}

/** Talking in the browser needs a ready voice agent and a connected voice provider, but no phone number and no calling permission. */
export function talkHereAvailability(f: ChatCallFacts): Availability {
  if (!f.chatCreated) return { enabled: false, reason: FIRST };
  if (!f.options) return { enabled: false, reason: LOADING };
  const o = f.options;
  if (o.agents.length === 0) return { enabled: false, reason: "There is no voice agent you can use yet. Ask an editor to create one and give you access." };
  if (!o.agents.some((a) => a.ready)) return { enabled: false, reason: "None of your voice agents is ready yet." };
  if (o.blockers.some((b) => b.code === "not_connected")) return { enabled: false, reason: "The voice provider isn't connected for this workspace. Ask an admin." };
  return { enabled: true, reason: null };
}

/** The note posted into the chat after a voice conversation. Plain text with a link to the call. */
export function voiceCallNote(agentName: string, callId: string, kind: "talk" | "phone"): string {
  const name = oneLine(agentName, 80) || "a voice agent";
  const where = kind === "talk" ? `a voice conversation with ${name}` : `a phone call with ${name}`;
  return `[Voice call] I had ${where}. [Open the call](/agentos/calls/${encodeURIComponent(callId)})`;
}
