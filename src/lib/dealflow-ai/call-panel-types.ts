import type { CallStatus } from "@/lib/products/agentos/calls/types";
import type { DealflowCallSpec } from "@/lib/dealflow-ai/call-targets";

/**
 * Shapes and pure helpers for DealFlow's "AI Voice Calls" page (client-safe: no server imports). The loader that fills them is
 * call-panel.ts. DealFlow owns no agents: every call here is an AgentOS engine call about a DealFlow record.
 */

export const PEOPLE_PAGE_SIZE = 30;
export const CALLS_PAGE_SIZE = 20;
export const PANEL_TIME_ZONE = "Asia/Kolkata";

export type PanelEntityType = "lead" | "applicant" | "submission";
export const PANEL_ENTITY_TYPES: readonly PanelEntityType[] = ["lead", "applicant", "submission"];
export const isPanelEntityType = (v: unknown): v is PanelEntityType => typeof v === "string" && (PANEL_ENTITY_TYPES as readonly string[]).includes(v);

export const PANEL_CATEGORIES = [
  { id: "jobs", label: "Job Applications" },
  { id: "interns", label: "Internship" },
  { id: "trainees", label: "Industrial Training" },
  { id: "clients", label: "Clients" },
] as const;
export type PanelCategory = (typeof PANEL_CATEGORIES)[number]["id"];
export const isPanelCategory = (v: unknown): v is PanelCategory => PANEL_CATEGORIES.some((c) => c.id === v);

/** "active" = a call is ringing or in progress; "all" = everyone; a category narrows to one pipeline. */
export type PanelFilter = "all" | "active" | PanelCategory;
export const isPanelFilter = (v: unknown): v is PanelFilter => v === "all" || v === "active" || isPanelCategory(v);

export const LIVE_STATUSES: readonly CallStatus[] = ["dialing", "in_progress"];
export const isLiveStatus = (s: string) => (LIVE_STATUSES as readonly string[]).includes(s);

export interface PanelPerson {
  /** `${entityType}:${entityId}`, unique in the list. */
  key: string;
  entityType: PanelEntityType;
  entityId: string;
  name: string;
  category: PanelCategory;
  /** Masked (first 3 and last 4 characters only); "" when the record has no number. */
  phoneMasked: string;
  callCount: number;
  lastCallAt: string | null;
  lastStatus: CallStatus | null;
  /** The id of a call ringing or in progress right now, if any. */
  activeCallId: string | null;
}

export interface PanelPeoplePage {
  people: PanelPerson[];
  total: number;
  page: number;
  pageSize: number;
}

/** How much of a call this viewer may open. */
export type PanelAccess =
  /** Transcript, recording and everything else, through AgentOS's own rules. */
  | "full"
  /** No AgentOS account: only the result DealFlow stored when the call ended. */
  | "no_account"
  /** Has an AgentOS account but may not see this call (someone else placed it): stored result only. */
  | "not_visible";

export interface PanelCall {
  id: string;
  access: PanelAccess;
  status: CallStatus;
  direction: string;
  testMode: boolean;
  /** ISO. The moment the call counts for: when it started (or is scheduled), else when it was created. */
  at: string;
  scheduledFor: string | null;
  agent: { id: string; name: string; icon: string; color: string; avatarUrl: string | null };
  purpose: string;
  purposeLabel: string;
  durationSecs: number | null;
  outcome: "success" | "failure" | "unknown" | null;
  summary: string | null;
  collected: { key: string; label: string; value: string }[];
  phoneMasked: string | null;
  live: boolean;
  /** Who placed it; only for calls this viewer can open in full. */
  calledBy: string | null;
  /** The detail is held only when the stored/engine copy has a transcript to look at. */
  agentosHref: string;
}

export interface PanelCallsPage {
  calls: PanelCall[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PanelPersonView extends Omit<PanelPerson, "callCount" | "lastCallAt" | "lastStatus" | "activeCallId"> {
  recordHref: string | null;
  callSpec: DealflowCallSpec;
}

export interface PanelActiveCall {
  id: string;
  entityType: string;
  entityId: string;
  personName: string;
  agentName: string;
  purposeLabel: string;
  status: CallStatus;
  /** ISO: when it was dialed (or created), the timer counts up from here. */
  startedAt: string;
  testMode: boolean;
  /** Ringing calls have no live view yet. */
  canLive: boolean;
  canEnd: boolean;
}

export interface PanelTranscriptLine {
  speaker: string;
  kind: "lead" | "ai" | "human";
  atSecs: number | null;
  text: string;
}

export interface PanelCallDetail {
  call: PanelCall;
  access: PanelAccess;
  /** Said plainly when the transcript or recording cannot be shown to this person. */
  accessNote: string | null;
  transcript: PanelTranscriptLine[] | null;
  recording: { url: string | null; note: string | null };
  controlHistory: { at: string; from: "ai" | "human"; to: "ai" | "human"; by: string }[];
  failure: string | null;
  terminationReason: string | null;
  summaryTitle: string | null;
  endedAt: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "12 Mar 2026, 4:05 pm IST" - always India Standard Time. */
export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: PANEL_TIME_ZONE })} IST`;
}

/** 3725 -> "1:02:05", 65 -> "1:05". */
export function formatTimer(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A readable duration for a finished call: "2 min 5 s". */
export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || secs <= 0) return "-";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

/** Filters transcript lines by a search text (case-insensitive, matches the words or the speaker). */
export function filterTranscript<T extends { text: string; speaker: string }>(lines: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...lines];
  return lines.filter((l) => l.text.toLowerCase().includes(q) || l.speaker.toLowerCase().includes(q));
}
