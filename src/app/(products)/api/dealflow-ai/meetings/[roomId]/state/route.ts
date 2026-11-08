import { NextRequest, NextResponse } from "next/server";
import { getMeeting, toMeetingView } from "@/lib/dealflow-ai/db-meetings";
import { canHostMeeting, canSeeMeeting, redactForGuest } from "@/lib/dealflow-ai/meetings/access";
import { getLiveKitCredentials, verifyRoomToken } from "@/lib/dealflow-ai/meetings/livekit";
import { resolveMeetingAgents } from "@/lib/dealflow-ai/meeting-agents";
import { requireLms } from "@/lib/lms-auth";
import { limitOr429 } from "@/lib/security/rate-limit";

import { withTransport } from "@/lib/security/transport";
/**
 * GET /api/dealflow-ai/meetings/[roomId]/state — the live roster for the room: who is on the list now (agents added or removed during the
 * meeting, guests waiting to be admitted, lock, status) plus the agents' display data. Authenticated by the LiveKit token the server issued
 * (`Authorization: Bearer`), so guests can use it; guests get the redacted view.
 */
async function handleGET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const m = await getMeeting(roomId);
    if (!m) return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    let view;
    if (bearer) {
      const limited = await limitOr429(req, "meeting-state", 120, 60);
      if (limited) return limited;
      const creds = await getLiveKitCredentials();
      const who = creds ? await verifyRoomToken(creds, bearer) : null;
      const me = who && who.roomId === roomId ? m.participants.find((p) => p.id === who.participantId) : null;
      if (!me || me.kind === "agent") return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
      view = me.kind === "external" ? redactForGuest(toMeetingView(m)) : toMeetingView(m);
    } else {
      const user = await requireLms("VIEW_LEADS");
      if (!user || !canSeeMeeting(user, m)) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
      view = toMeetingView(m, { audit: canHostMeeting(user, m) });
    }
    const agents = await resolveMeetingAgents(m.participants.filter((p) => p.kind === "agent" && p.refId).map((p) => p.refId!));
    return NextResponse.json({ ok: true, meeting: view, agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[meetings/state] GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load the meeting" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
