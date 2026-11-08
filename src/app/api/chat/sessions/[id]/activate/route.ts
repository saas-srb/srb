import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import {
  applyChatCookies,
  getVisitorIdFromRequest,
  activateVisitorSession,
} from "@/lib/chatbot-sessions";

type Context = { params: Promise<{ id: string }> };

/** Switch the active-conversation cookie to another of this browser's chats. */
async function handlePOST(req: NextRequest, { params }: Context) {
  const visitorId = getVisitorIdFromRequest(req);
  if (!visitorId) return NextResponse.json({ error: "No session." }, { status: 401 });

  const { id } = await params;
  const { ok, cookiesToSet } = await activateVisitorSession(id, visitorId);
  if (!ok) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const res = NextResponse.json({ ok: true, sessionId: id });
  return applyChatCookies(res, cookiesToSet);
}

export const POST = withTransport(handlePOST);
