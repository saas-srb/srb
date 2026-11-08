import { NextRequest, NextResponse } from "next/server";
import { getMeeting, listMeetings, toMeetingView, MEETING_STATUSES, type MeetingStatus } from "@/lib/dealflow-ai/db-meetings";
import { isMeetingManager, staffActor } from "@/lib/dealflow-ai/meetings/access";
import { sendMeetingInvites } from "@/lib/dealflow-ai/meetings/invites";
import { requestOrigin } from "@/lib/dealflow-ai/meetings/origin";
import { createMeetingFromInput } from "@/lib/dealflow-ai/meetings/service";
import { guestLink } from "@/lib/dealflow-ai/meetings/tokens";
import { requireLms } from "@/lib/lms-auth";
import { listAgentsFor } from "@/lib/products/agentos/picker";

import { withTransport } from "@/lib/security/transport";
const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

/** GET /api/dealflow-ai/meetings?status=&agentId=&staffId=&q= — the meetings the signed-in person may see (everyone's for managers). */
async function handleGET(req: NextRequest) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status");
    const statuses = status ? status.split(",").filter((s): s is MeetingStatus => (MEETING_STATUSES as readonly string[]).includes(s)) : [];
    const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 80);
    const list = await listMeetings({
      ...(statuses.length ? { status: statuses } : {}),
      ...(isMeetingManager(user) ? {} : { visibleTo: user.id }),
      ...(sp.get("agentId") ? { agentId: sp.get("agentId")! } : {}),
      ...(sp.get("staffId") ? { participantRefId: sp.get("staffId")! } : {}),
    });
    const meetings = list
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.participants.some((p) => p.name.toLowerCase().includes(q) || (p.email ?? "").includes(q) || (p.company ?? "").toLowerCase().includes(q)))
      .map((m) => toMeetingView(m));
    return NextResponse.json({ ok: true, meetings, canSeeAll: isMeetingManager(user) });
  } catch (err) {
    console.error("[meetings] GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load meetings" }, { status: 500 });
  }
}

async function handlePOST(req: NextRequest) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const body = await req.json().catch(() => null);
    const made = await createMeetingFromInput(body, user, { agents: async () => (await listAgentsFor({ kind: "voice" })).map((a) => ({ id: a.id, name: a.name })) });
    if (!made.ok) return NextResponse.json({ ok: false, error: made.error }, { status: made.status });
    const origin = requestOrigin(req);
    const actor = await staffActor(user);
    let invites: Awaited<ReturnType<typeof sendMeetingInvites>> = [];
    if (made.sendInvites) {
      const host = made.meeting.participants.find((p) => p.refId === user.id);
      invites = await sendMeetingInvites(made.meeting, made.meeting.participants, {
        origin, kind: "invite", organizer: { name: actor.name, email: host?.email ?? user.email }, tokens: new Map(made.tokens.map((t) => [t.participantId, t.token])), actor,
      });
    }
    const fresh = (await getMeeting(made.meeting.roomId)) ?? made.meeting;
    return NextResponse.json({
      ok: true,
      meeting: toMeetingView(fresh, { audit: true }),
      // Shown once: only the hash is stored.
      guestLinks: made.tokens.map((t) => ({ participantId: t.participantId, name: made.meeting.participants.find((p) => p.id === t.participantId)?.name ?? "", url: guestLink(origin, made.meeting.roomId, t.token) })),
      invites,
    }, { status: 201 });
  } catch (err) {
    console.error("[meetings] POST error:", err);
    return NextResponse.json({ ok: false, error: "Failed to create meeting" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
