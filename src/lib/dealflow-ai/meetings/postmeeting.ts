import "server-only";
import { claimPostProcessing, claimTimelineWrite, getMeeting, releasePostProcessing, saveMeetingResult, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { assembleTranscript, listUtterances } from "@/lib/dealflow-ai/meetings/utterances";
import { writeTimelineEntry } from "@/lib/dealflow-ai/call-results";
import { getOpenAI, isOpenAIConfigured } from "@/lib/openai";
import { getPrompt } from "@/lib/prompts/store";
import { defaultPrompt } from "@/lib/prompts/defaults";
import type { MeetingUtterance } from "@/lib/dealflow-ai/meetings/types";

/**
 * After a meeting: the transcript is assembled from the stored lines, a faithful summary and the action items are written by the company's own
 * OpenAI (skipped, with a note, when AI isn't connected), and one entry goes on the linked lead's timeline. The meeting is claimed first, so
 * however many things trigger this (the cron, the page, the "Generate" button) it happens once.
 */

export interface Summary {
  summary: string;
  actionItems: { text: string; owner?: string; due?: string }[];
}

export const TRANSCRIPT_MIN_CHARS = 40;
const PROMPT_MAX = 60_000;

export function parseSummary(raw: string): Summary | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  const o = j as { summary?: unknown; actionItems?: unknown };
  const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 8000) : "";
  if (!summary) return null;
  const items = Array.isArray(o.actionItems) ? o.actionItems : [];
  const actionItems = items.slice(0, 30).flatMap((it) => {
    if (typeof it !== "object" || it === null) return [];
    const r = it as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 500) : "";
    if (!text) return [];
    const owner = typeof r.owner === "string" ? r.owner.trim().slice(0, 120) : "";
    const due = typeof r.due === "string" ? r.due.trim().slice(0, 60) : "";
    return [{ text, ...(owner ? { owner } : {}), ...(due ? { due } : {}) }];
  });
  return { summary, actionItems };
}

/** `system` is the registry prompt "meetings.summary" (the caller fetches it with `getPrompt`); the built-in text is the default for callers without a database. */
export function summaryPrompt(m: Pick<MeetingRoom, "title" | "agenda" | "participants">, transcript: string, system: string = defaultPrompt("meetings.summary")): { system: string; user: string } {
  const people = m.participants.map((p) => `${p.name} (${p.kind === "agent" ? "AI agent" : p.kind === "internal" ? "team member" : "guest"})`).join(", ");
  const body = transcript.length > PROMPT_MAX ? `${transcript.slice(0, PROMPT_MAX / 2)}\n[... middle of the transcript omitted ...]\n${transcript.slice(-PROMPT_MAX / 2)}` : transcript;
  return {
    system,
    user: `Meeting: ${m.title}\nParticipants: ${people}\n${m.agenda?.description ? `Agenda: ${m.agenda.description}\n` : ""}\nTranscript:\n${body}`,
  };
}

export interface PostDeps {
  summarize?: (m: MeetingRoom, transcript: string) => Promise<Summary | null>;
  aiConfigured?: () => Promise<boolean>;
  lines?: (roomId: string) => Promise<MeetingUtterance[]>;
  writeTimeline?: typeof writeTimelineEntry;
}

async function defaultSummarize(m: MeetingRoom, transcript: string): Promise<Summary | null> {
  const { system, user } = summaryPrompt(m, transcript, await getPrompt("meetings.summary"));
  const openai = await getOpenAI({ timeoutMs: 60_000, maxRetries: 1 });
  const res = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  return parseSummary(res.choices[0]?.message?.content ?? "");
}

export type PostResult = { ran: false; reason: string } | { ran: true; summarized: boolean; note?: string; timeline: number };

export function timelineText(m: Pick<MeetingRoom, "title" | "summary" | "actionItems" | "roomId" | "participants" | "summaryNote">): string {
  const lines: string[] = [];
  if (m.summary) lines.push(m.summary);
  else if (m.summaryNote) lines.push(m.summaryNote);
  if (m.actionItems?.length) lines.push(`Action items: ${m.actionItems.map((a) => `${a.text}${a.owner ? ` (${a.owner})` : ""}`).join("; ")}`);
  lines.push(`With: ${m.participants.filter((p) => p.kind !== "agent").map((p) => p.name).join(", ")}${m.participants.some((p) => p.kind === "agent") ? ` and ${m.participants.filter((p) => p.kind === "agent").map((p) => p.name).join(", ")} (AI)` : ""}`);
  lines.push(`Meeting: /dealflow-ai/meetings/${m.roomId}/details`);
  return lines.join("\n");
}

/** `force` re-runs a meeting that has no summary yet (for example because AI was connected afterwards). It never replaces an existing summary. */
export async function runPostMeeting(roomId: string, deps: PostDeps = {}, opts: { force?: boolean } = {}): Promise<PostResult> {
  if (opts.force) {
    const cur = await getMeeting(roomId);
    if (cur?.summary) return { ran: false, reason: "A summary already exists." };
    if (cur?.status === "ended" && cur.postProcessedAt) await releasePostProcessing(roomId);
  }
  const claimed = await claimPostProcessing(roomId);
  if (!claimed) return { ran: false, reason: "Already processed or not ended." };
  try {
    const lines = await (deps.lines ?? ((id) => listUtterances(id)))(roomId);
    const transcript = assembleTranscript(lines).slice(0, 200_000);
    let note: string | undefined;
    let summary: Summary | null = null;
    if (transcript.length < TRANSCRIPT_MIN_CHARS) note = "No conversation was recorded in this meeting, so there is nothing to summarise.";
    else if (!(await (deps.aiConfigured ?? isOpenAIConfigured)())) note = "AI isn't connected for this workspace, so no summary was written. The transcript is saved.";
    else {
      summary = await (deps.summarize ?? defaultSummarize)(claimed, transcript);
      if (!summary) note = "The summary could not be produced from this transcript.";
    }
    const saved = await saveMeetingResult(
      roomId,
      { ...(transcript ? { transcript } : {}), ...(summary ? { summary: summary.summary, actionItems: summary.actionItems } : {}), ...(note ? { summaryNote: note } : {}) },
      { action: "summary", detail: summary ? "summary written" : (note ?? "").slice(0, 150) },
    );
    let timeline = 0;
    const fresh = saved ?? claimed;
    if (fresh.target && !fresh.timelineWrittenAt) {
      timeline = await (deps.writeTimeline ?? writeTimelineEntry)(fresh.target, { id: `meeting_${fresh.roomId}`, kind: "meeting", title: `Meeting: ${fresh.title}`, detail: timelineText(fresh) });
      if (timeline > 0) await claimTimelineWrite(roomId);
    }
    return { ran: true, summarized: !!summary, ...(note ? { note } : {}), timeline };
  } catch (e) {
    // Nothing was decided: let the next run try again.
    await releasePostProcessing(roomId).catch(() => {});
    throw e;
  }
}
