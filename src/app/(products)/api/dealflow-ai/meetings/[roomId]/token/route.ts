import { NextRequest, NextResponse } from "next/server";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { guestLinkStatus, joinAsGuest, joinAsStaff } from "@/lib/dealflow-ai/meetings/access";
import { limitOr429 } from "@/lib/security/rate-limit";
import { requireLms } from "@/lib/lms-auth";

import { withTransport } from "@/lib/security/transport";
/**
 * POST /api/dealflow-ai/meetings/[roomId]/token — the only way into a room. The server decides who the caller is:
 *  - signed-in staff: a listed participant, or a manager / the creator (who is then added); the first host to arrive starts the meeting.
 *  - a guest: body { token } with their personal link token. Rate limited. The name, identity and role are the roster's.
 *    { token, check: true } only reports the link's state (for the pre-join page) and issues nothing.
 * AI agents never get a token; their audio is published by a staff member's browser.
 */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const body = (await req.json().catch(() => ({}))) as { token?: unknown; check?: unknown };
    const guestToken = typeof body.token === "string" ? body.token : null;

    if (guestToken) {
      const limited = await limitOr429(req, "meeting-guest", 90, 60);
      if (limited) return limited;
      const m = await getMeeting(roomId);
      // Same answer for "no such meeting" and "wrong token": nothing to learn by guessing.
      if (!m) return NextResponse.json({ ok: false, code: "invalid", error: "This link is not valid. Ask the host to send you a new one." }, { status: 403 });
      if (body.check === true) {
        const s = guestLinkStatus(m, guestToken);
        return s.ok ? NextResponse.json(s) : NextResponse.json({ ok: false, code: s.code, error: s.message, meeting: s.meeting }, { status: s.code === "invalid" ? 403 : 410 });
      }
      const r = await joinAsGuest(m, guestToken);
      if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message, meeting: r.meeting }, { status: r.status });
      return NextResponse.json({ ok: true, ...r.props });
    }

    const user = await requireLms("VIEW_LEADS");
    if (!user) return NextResponse.json({ ok: false, code: "denied", error: "Sign in to join this meeting." }, { status: 401 });
    const m = await getMeeting(roomId);
    if (!m) return NextResponse.json({ ok: false, code: "not_found", error: "Meeting not found" }, { status: 404 });
    const r = await joinAsStaff(m, user);
    if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message, meeting: r.meeting }, { status: r.status });
    return NextResponse.json({ ok: true, ...r.props });
  } catch (err) {
    console.error("[meetings/token] POST error:", err);
    return NextResponse.json({ ok: false, error: "Failed to generate token" }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
