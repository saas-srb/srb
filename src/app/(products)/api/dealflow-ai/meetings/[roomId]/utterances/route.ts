import { NextRequest, NextResponse } from "next/server";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { canSeeMeeting } from "@/lib/dealflow-ai/meetings/access";
import { acceptUtterance, listUtterances } from "@/lib/dealflow-ai/meetings/utterances";
import { requireLms } from "@/lib/lms-auth";
import { limitOr429 } from "@/lib/security/rate-limit";

import { withTransport } from "@/lib/security/transport";
/**
 * POST /api/dealflow-ai/meetings/[roomId]/utterances   Authorization: Bearer <the LiveKit token issued for this person>
 *   body { id, text, at?, speakerId?, addressedTo? } — stores one finalized line (idempotent per id). The speaker is the token's person; the
 *   elected agent runner may also store lines as one of the meeting's AI agents (speakerId = the agent's participant id).
 */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const limited = await limitOr429(req, "meeting-utterance", 240, 60);
    if (limited) return limited;
    const { roomId } = await params;
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    const r = await acceptUtterance(roomId, bearer, await req.json().catch(() => null));
    return r.ok ? NextResponse.json({ ok: true, stored: r.stored }) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  } catch (err) {
    console.error("[meetings/utterances] POST error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save the line" }, { status: 500 });
  }
}

/** GET — the stored transcript, for staff who may see the meeting. */
async function handleGET(_: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const { roomId } = await params;
  const m = await getMeeting(roomId);
  if (!m || !canSeeMeeting(user, m)) return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  return NextResponse.json({ ok: true, lines: await listUtterances(roomId) });
}

export const POST = withTransport(handlePOST);
export const GET = withTransport(handleGET);
