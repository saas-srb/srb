import { NextRequest, NextResponse } from "next/server";
import { addParticipants, getMeeting, regenerateGuestToken, removeParticipant, revokeGuestToken, setRoomFlags, setWaiting, toMeetingView, updateParticipant } from "@/lib/dealflow-ai/db-meetings";
import { canHostMeeting, canSeeMeeting, staffActor } from "@/lib/dealflow-ai/meetings/access";
import { sendMeetingInvites } from "@/lib/dealflow-ai/meetings/invites";
import { requestOrigin } from "@/lib/dealflow-ai/meetings/origin";
import { runPostMeeting } from "@/lib/dealflow-ai/meetings/postmeeting";
import { loadDirectory } from "@/lib/dealflow-ai/meetings/service";
import { guestLink } from "@/lib/dealflow-ai/meetings/tokens";
import { normalizeParticipant, parseAliases } from "@/lib/dealflow-ai/meetings/validate";
import { nanoid } from "@/lib/dealflow-ai/nanoid";
import { requireLms } from "@/lib/lms-auth";
import { listAgentsFor } from "@/lib/products/agentos/picker";
import type { MeetingParticipant } from "@/lib/dealflow-ai/meetings/types";

import { withTransport } from "@/lib/security/transport";
const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * POST /api/dealflow-ai/meetings/[roomId]/actions — host actions on a meeting. Body: { action, ... }
 *   add_participants { participants, sendInvites? }   remove_participant { participantId }   update_participant { participantId, aliases?, role? }
 *   regenerate_link { participantId }   revoke_link { participantId }   resend_invites { participantIds? }
 *   lock | unlock   waiting_room { enabled }   admit { participantId }   deny { participantId }   generate_summary
 * Links are returned once; only their hash is kept.
 */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return deny();
  try {
    const { roomId } = await params;
    const m = await getMeeting(roomId);
    if (!m || !canSeeMeeting(user, m)) return bad("Meeting not found", 404);
    if (!canHostMeeting(user, m)) return deny();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return bad("Invalid request");
    const actor = await staffActor(user);
    const origin = requestOrigin(req);
    const organizer = { name: actor.name, email: m.participants.find((p) => p.refId === user.id)?.email ?? user.email };
    const pid = typeof body.participantId === "string" ? body.participantId : "";
    const respond = async (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, meeting: toMeetingView((await getMeeting(roomId)) ?? m, { audit: true }), ...extra });
    const fail = (r: { error: string; status: number }) => bad(r.error, r.status);

    switch (body.action) {
      case "add_participants": {
        if (!Array.isArray(body.participants) || body.participants.length === 0) return bad("Pick at least one person to add.");
        const dir = await loadDirectory(body.participants, { agents: async () => (await listAgentsFor({ kind: "voice" })).map((a) => ({ id: a.id, name: a.name })) });
        const now = new Date();
        const people: MeetingParticipant[] = [];
        for (const raw of body.participants) {
          const n = normalizeParticipant(raw, dir, () => `p_${nanoid(10)}`, now);
          if (!n.ok) return bad(n.error);
          people.push(n.value);
        }
        const res = await addParticipants(roomId, people, actor);
        if (!res.ok) return fail(res);
        const tokens = new Map(res.result.tokens.map((t) => [t.participantId, t.token]));
        let invites: unknown[] = [];
        const wantInvites = body.sendInvites !== false && res.meeting.status === "scheduled";
        if (wantInvites) invites = await sendMeetingInvites(res.meeting, res.meeting.participants.filter((p) => people.some((x) => x.id === p.id)), { origin, kind: "invite", organizer, tokens, actor });
        return respond({ invites, guestLinks: res.result.tokens.map((t) => ({ participantId: t.participantId, name: people.find((p) => p.id === t.participantId)?.name ?? "", url: guestLink(origin, roomId, t.token) })) });
      }
      case "remove_participant": {
        const res = await removeParticipant(roomId, pid, actor);
        if (!res.ok) return fail(res);
        if (res.result.removed.kind !== "agent" && res.result.removed.invite?.state === "sent" && res.meeting.status === "scheduled") {
          await sendMeetingInvites(res.meeting, [res.result.removed], { origin, kind: "cancel", organizer, actor });
        }
        return respond();
      }
      case "update_participant": {
        const p = m.participants.find((x) => x.id === pid);
        if (!p) return bad("That participant is not in this meeting.", 404);
        const patch: Partial<Pick<MeetingParticipant, "aliases" | "role">> = {};
        if (body.aliases !== undefined) {
          if (p.kind !== "agent") return bad("Only AI agents have aliases.");
          const a = parseAliases(body.aliases, p.name);
          if (!a.ok) return bad(a.error);
          patch.aliases = a.value;
        }
        if (body.role !== undefined) {
          if (p.kind !== "internal" || !["host", "cohost", "participant"].includes(String(body.role))) return bad("Only team members can be hosts.");
          patch.role = body.role as MeetingParticipant["role"];
        }
        const res = await updateParticipant(roomId, pid, patch, actor);
        return res.ok ? respond() : fail(res);
      }
      case "regenerate_link": {
        const res = await regenerateGuestToken(roomId, pid, actor);
        return res.ok ? respond({ guestLinks: [{ participantId: pid, name: res.meeting.participants.find((p) => p.id === pid)?.name ?? "", url: guestLink(origin, roomId, res.result.token) }] }) : fail(res);
      }
      case "revoke_link": {
        const res = await revokeGuestToken(roomId, pid, actor);
        return res.ok ? respond() : fail(res);
      }
      case "resend_invites": {
        if (m.status !== "scheduled" && m.status !== "live") return bad("This meeting is over.", 409);
        const ids = Array.isArray(body.participantIds) ? new Set(body.participantIds.filter((x): x is string => typeof x === "string")) : null;
        const who = m.participants.filter((p) => p.kind !== "agent" && (!ids || ids.has(p.id)));
        const invites = await sendMeetingInvites(m, who, { origin, kind: m.sequence ? "update" : "invite", organizer, actor });
        return respond({ invites });
      }
      case "lock":
      case "unlock": {
        const res = await setRoomFlags(roomId, { locked: body.action === "lock" }, actor);
        return res.ok ? respond() : fail(res);
      }
      case "waiting_room": {
        const res = await setRoomFlags(roomId, { waitingRoom: body.enabled === true }, actor);
        return res.ok ? respond() : fail(res);
      }
      case "admit":
      case "deny": {
        const res = await setWaiting(roomId, pid, body.action === "admit" ? "admitted" : "denied", actor);
        return res.ok ? respond() : fail(res);
      }
      case "generate_summary": {
        if (m.status !== "ended") return bad("The summary is written after the meeting has ended.", 409);
        const r = await runPostMeeting(roomId, {}, { force: true });
        return respond({ post: r });
      }
      default:
        return bad("Unknown action");
    }
  } catch (err) {
    console.error("[meetings/actions] error:", err);
    return NextResponse.json({ ok: false, error: "That didn't work. Try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
