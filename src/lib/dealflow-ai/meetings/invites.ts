import "server-only";
import { sendEmail, type EmailResult } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { regenerateGuestToken, setInviteStatus, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { SYSTEM_ACTOR, type Actor } from "@/lib/dealflow-ai/db-meetings";
import { buildIcs } from "@/lib/dealflow-ai/meetings/ics";
import { guestLink } from "@/lib/dealflow-ai/meetings/tokens";
import type { InviteStatus, MeetingParticipant } from "@/lib/dealflow-ai/meetings/types";

/**
 * Invitation mail with a calendar attachment, sent through the company's own email connection (the platform's sender when it has none).
 * One message per person: guests get their personal link, staff the link to the room page. Each outcome is recorded on the participant.
 */

export type InviteKind = "invite" | "update" | "cancel";
export type SendFn = (msg: { to: string; subject: string; html: string; text: string; replyTo?: string; calendar: { method: "REQUEST" | "CANCEL"; ics: string } }) => Promise<EmailResult>;

export interface InviteContext {
  origin: string;
  organizer: { name: string; email: string };
  kind: InviteKind;
  send?: SendFn;
  brand?: string;
  /** Guests' raw tokens, when the caller just created them (otherwise sending to a guest makes a fresh link). */
  tokens?: Map<string, string>;
  actor?: Actor;
}

export interface InviteOutcome {
  participantId: string;
  name: string;
  state: InviteStatus["state"];
  error?: string;
}

const defaultSend: SendFn = (m) => sendEmail({ to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo, calendar: m.calendar });

export function formatWhen(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(iso)) + ` (${timezone})`;
  } catch {
    return iso;
  }
}

export function inviteCopy(m: Pick<MeetingRoom, "title" | "scheduledAt" | "timezone" | "durationMinutes" | "agenda" | "participants">, p: Pick<MeetingParticipant, "name">, kind: InviteKind, brand: string, url: string): { subject: string; html: string; text: string } {
  const when = formatWhen(m.scheduledAt, m.timezone);
  const others = m.participants.filter((x) => x.kind !== "agent").map((x) => x.name);
  const agents = m.participants.filter((x) => x.kind === "agent").map((x) => x.name);
  const lines: string[] = [`Hi ${p.name},`];
  if (kind === "cancel") lines.push(`The meeting "${m.title}" scheduled for ${when} has been cancelled.`);
  else {
    lines.push(kind === "update" ? `The meeting "${m.title}" has been updated. It is now on ${when}, for ${m.durationMinutes} minutes.` : `You are invited to "${m.title}" on ${when}, for ${m.durationMinutes} minutes.`);
    if (m.agenda?.description || m.agenda?.title) lines.push(`Agenda: ${m.agenda.description || m.agenda.title}`);
    if (others.length) lines.push(`With: ${others.join(", ")}.`);
    if (agents.length) lines.push(`AI assistants in the meeting: ${agents.join(", ")}. They speak when addressed by name.`);
  }
  const { html, text } = renderEmail({
    brand,
    heading: kind === "cancel" ? `Cancelled: ${m.title}` : kind === "update" ? `Updated: ${m.title}` : m.title,
    paragraphs: lines,
    ...(kind === "cancel" ? {} : { action: { label: "Join meeting", url } }),
    footnote: kind === "cancel" ? "A calendar update is attached so the event leaves your calendar." : "This is your personal link; please don't share it. A calendar invitation is attached.",
  });
  const subject = `${kind === "cancel" ? "Cancelled" : kind === "update" ? "Updated invitation" : "Invitation"}: ${m.title} · ${formatWhen(m.scheduledAt, m.timezone)}`;
  return { subject, html, text };
}

/** Sends to the given people (those without an email are marked skipped). Never throws; returns what happened to each. */
export async function sendMeetingInvites(m: MeetingRoom, people: MeetingParticipant[], ctx: InviteContext): Promise<InviteOutcome[]> {
  const send = ctx.send ?? defaultSend;
  const brand = ctx.brand ?? (await currentCompanyIdOrNull().then((id) => (id ? getCompany(id) : null)).then((c) => c?.name).catch(() => undefined)) ?? "Meetings";
  const out: InviteOutcome[] = [];
  const sequence = m.sequence ?? 0;
  for (const p of people) {
    if (p.kind === "agent") continue;
    const record = async (invite: InviteStatus) => {
      await setInviteStatus(m.roomId, p.id, invite).catch(() => {});
      out.push({ participantId: p.id, name: p.name, state: invite.state, ...(invite.error ? { error: invite.error } : {}) });
    };
    if (!p.email) {
      await record({ state: "skipped", at: new Date().toISOString(), error: "No email address", sequence });
      continue;
    }
    try {
      let url: string;
      if (p.kind === "internal") url = `${ctx.origin}/dealflow-ai/meetings/${encodeURIComponent(m.roomId)}`;
      else if (ctx.kind === "cancel") url = `${ctx.origin}/meeting/${encodeURIComponent(m.roomId)}`;
      else {
        let token = ctx.tokens?.get(p.id);
        if (!token) {
          const fresh = await regenerateGuestToken(m.roomId, p.id, ctx.actor ?? SYSTEM_ACTOR);
          if (!fresh.ok) {
            await record({ state: "failed", at: new Date().toISOString(), error: fresh.error, sequence });
            continue;
          }
          token = fresh.result.token;
        }
        url = guestLink(ctx.origin, m.roomId, token);
      }
      const copy = inviteCopy(m, p, ctx.kind, brand, url);
      const ics = buildIcs({
        roomId: m.roomId, title: m.title, description: m.agenda?.description || m.agenda?.title, start: new Date(m.scheduledAt), durationMinutes: m.durationMinutes,
        sequence: ctx.kind === "cancel" ? sequence + 1 : sequence, method: ctx.kind === "cancel" ? "CANCEL" : "REQUEST", organizer: ctx.organizer, attendee: { name: p.name, email: p.email }, url,
      });
      const res = await send({ to: p.email, ...copy, replyTo: ctx.organizer.email || undefined, calendar: { method: ctx.kind === "cancel" ? "CANCEL" : "REQUEST", ics } });
      await record(res.ok ? { state: "sent", at: new Date().toISOString(), sequence } : { state: "failed", at: new Date().toISOString(), error: res.error.slice(0, 300), sequence });
    } catch (e) {
      await record({ state: "failed", at: new Date().toISOString(), error: (e instanceof Error ? e.message : "send failed").slice(0, 300), sequence });
    }
  }
  return out;
}
