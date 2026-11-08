import { NextRequest, NextResponse } from "next/server";
import { getMeeting, deleteMeeting, toMeetingView, transitionMeeting, updateMeetingFields, saveMeetingResult, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { canHostMeeting, canSeeMeeting, staffActor } from "@/lib/dealflow-ai/meetings/access";
import { sendMeetingInvites } from "@/lib/dealflow-ai/meetings/invites";
import { requestOrigin } from "@/lib/dealflow-ai/meetings/origin";
import { parseMeetingFields } from "@/lib/dealflow-ai/meetings/validate";
import { MEETING_TEXT_MAX } from "@/lib/dealflow-ai/db-meetings";
import { requireLms } from "@/lib/lms-auth";

import { withTransport } from "@/lib/security/transport";
const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
const notFound = () => NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
type Ctx = { params: Promise<{ roomId: string }> };

async function handleGET(_: NextRequest, { params }: Ctx) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const m = await getMeeting((await params).roomId);
    if (!m || !canSeeMeeting(user, m)) return notFound();
    return NextResponse.json({ ok: true, meeting: toMeetingView(m, { audit: canHostMeeting(user, m) }), canHost: canHostMeeting(user, m) });
  } catch (err) {
    console.error("[meetings/[roomId]] GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load meeting" }, { status: 500 });
  }
}

/**
 * PATCH { status: "live" | "ended" | "cancelled", reason? }  moves the meeting along its life (cancelling mails the invited people a calendar cancellation);
 * PATCH { recordingUrl? }                                   saves an https recording link;
 * PATCH { title?, agenda?, scheduledAt?, durationMinutes?, timezone?, agentSettings?, waitingRoom?, target?, notify? }  edits it (a new time sends the updated invitation).
 */
async function handlePATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const { roomId } = await params;
    const m = await getMeeting(roomId);
    if (!m || !canSeeMeeting(user, m)) return notFound();
    if (!canHostMeeting(user, m)) return deny();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    const actor = await staffActor(user);
    const origin = requestOrigin(req);
    const host = m.participants.find((p) => p.refId === user.id);
    const organizer = { name: actor.name, email: host?.email ?? user.email };

    if (typeof body.status === "string") {
      if (!["live", "ended", "cancelled"].includes(body.status)) return NextResponse.json({ ok: false, error: "A valid status is required" }, { status: 400 });
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const res = await transitionMeeting(roomId, body.status as "live" | "ended" | "cancelled", actor, { reason });
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
      let invites: unknown[] = [];
      if (body.status === "cancelled" && res.result.changed) {
        const invited = res.meeting.participants.filter((p) => p.invite?.state === "sent");
        invites = await sendMeetingInvites(res.meeting, invited, { origin, kind: "cancel", organizer, actor });
      }
      return NextResponse.json({ ok: true, meeting: toMeetingView((await getMeeting(roomId)) ?? res.meeting, { audit: true }), invites });
    }

    if (body.recordingUrl !== undefined) {
      let url: URL;
      try {
        url = new URL(String(body.recordingUrl));
      } catch {
        return NextResponse.json({ ok: false, error: "recordingUrl must be a valid https URL" }, { status: 400 });
      }
      if (url.protocol !== "https:" || url.username || url.password || url.toString().length > MEETING_TEXT_MAX.recordingUrl) return NextResponse.json({ ok: false, error: "recordingUrl must be a valid https URL" }, { status: 400 });
      const saved = await saveMeetingResult(roomId, { recordingUrl: url.toString() });
      return saved ? NextResponse.json({ ok: true, meeting: toMeetingView(saved, { audit: true }) }) : notFound();
    }

    const base = { title: m.title, agenda: m.agenda, scheduledAt: m.scheduledAt, durationMinutes: m.durationMinutes, timezone: m.timezone, agentSettings: m.agentSettings, waitingRoom: !!m.waitingRoom, target: m.target ?? null };
    const fields = parseMeetingFields(body, new Date(), base);
    if (!fields.ok) return NextResponse.json({ ok: false, error: fields.error }, { status: 400 });
    const res = await updateMeetingFields(roomId, fields.value, actor);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    let invites: unknown[] = [];
    if (res.result.rescheduled && body.notify !== false) {
      const invited: MeetingRoom["participants"] = res.meeting.participants.filter((p) => p.invite?.state === "sent");
      invites = await sendMeetingInvites(res.meeting, invited, { origin, kind: "update", organizer, actor });
    }
    return NextResponse.json({ ok: true, meeting: toMeetingView((await getMeeting(roomId)) ?? res.meeting, { audit: true }), invites });
  } catch (err) {
    console.error("[meetings/[roomId]] PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Failed to update meeting" }, { status: 500 });
  }
}

/** Permanently removes a meeting that is not running. Cancelling (PATCH) keeps the record. */
async function handleDELETE(_: NextRequest, { params }: Ctx) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const { roomId } = await params;
    const m = await getMeeting(roomId);
    if (!m || !canSeeMeeting(user, m)) return notFound();
    if (!canHostMeeting(user, m)) return deny();
    if (m.status === "live") return NextResponse.json({ ok: false, error: "End the meeting before deleting it." }, { status: 409 });
    return (await deleteMeeting(roomId)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (err) {
    console.error("[meetings/[roomId]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: "Failed to delete meeting" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const PATCH = withTransport(handlePATCH);
export const DELETE = withTransport(handleDELETE);
