import "server-only";
import { claimReminder, listMeetings, SYSTEM_ACTOR, transitionMeeting, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { runPostMeeting } from "@/lib/dealflow-ai/meetings/postmeeting";
import { notify } from "@/lib/platform/notifications";

/** The scheduled job (every 5 minutes, for each company): reminders for staff, ending abandoned meetings, and the post-meeting summary. */

export const AUTO_END_AFTER_MS = 90 * 60_000;
export const SUMMARY_DELAY_MS = 2 * 60_000;

/** Which reminders are due: the 60-minute one from 60 minutes out (skipped when the meeting is less than 15 minutes away, the 10-minute one covers it), the 10-minute one from 10 minutes out. */
export function dueReminders(m: Pick<MeetingRoom, "scheduledAt" | "remindersSent" | "status">, now: Date): { which: "m60" | "m10"; send: boolean }[] {
  if (m.status !== "scheduled") return [];
  const mins = (new Date(m.scheduledAt).getTime() - now.getTime()) / 60_000;
  if (mins <= 0) return [];
  const out: { which: "m60" | "m10"; send: boolean }[] = [];
  if (mins <= 60 && !m.remindersSent?.m60) out.push({ which: "m60", send: mins >= 15 });
  if (mins <= 10 && !m.remindersSent?.m10) out.push({ which: "m10", send: true });
  return out;
}

export interface SweepDeps {
  notifyStaff?: (userIds: string[], title: string, body: string, url: string) => Promise<number>;
  post?: typeof runPostMeeting;
}

export async function runMeetingsSweep(now = new Date(), deps: SweepDeps = {}): Promise<{ reminders: number; autoEnded: number; summarised: number }> {
  const send = deps.notifyStaff ?? (async (userIds, title, body, url) => notify({ to: { userIds }, title, body, url }));
  let reminders = 0, autoEnded = 0, summarised = 0;

  const soon = await listMeetings({ status: "scheduled", fromIso: now.toISOString(), toIso: new Date(now.getTime() + 61 * 60_000).toISOString(), order: "asc", limit: 200 });
  for (const m of soon) {
    for (const r of dueReminders(m, now)) {
      if (!(await claimReminder(m.roomId, r.which))) continue;
      if (!r.send) continue;
      const staff = [...new Set(m.participants.filter((p) => p.kind === "internal" && p.refId).map((p) => p.refId!))];
      if (!staff.length) continue;
      const mins = Math.max(1, Math.round((new Date(m.scheduledAt).getTime() - now.getTime()) / 60_000));
      await send(staff, `Meeting in ${mins} minutes`, `${m.title} starts in about ${mins} minutes.`, `/dealflow-ai/meetings/${m.roomId}/details`).catch((e) => console.error("[meetings] reminder failed", e));
      reminders++;
    }
  }

  const live = await listMeetings({ status: "live", limit: 200 });
  for (const m of live) {
    const end = new Date(m.scheduledAt).getTime() + m.durationMinutes * 60_000;
    if (now.getTime() - end > AUTO_END_AFTER_MS) {
      const r = await transitionMeeting(m.roomId, "ended", SYSTEM_ACTOR, { reason: "Ended automatically after the scheduled time" });
      if (r.ok && r.result.changed) autoEnded++;
    }
  }

  const ended = await listMeetings({ status: "ended", fromIso: new Date(now.getTime() - 3 * 24 * 3600_000).toISOString(), limit: 200 });
  for (const m of ended) {
    if (m.postProcessedAt || !m.endedAt || now.getTime() - new Date(m.endedAt).getTime() < SUMMARY_DELAY_MS) continue;
    try {
      const r = await (deps.post ?? runPostMeeting)(m.roomId);
      if (r.ran) summarised++;
    } catch (e) {
      console.error("[meetings] post-meeting failed", m.roomId, e);
    }
  }
  return { reminders, autoEnded, summarised };
}
