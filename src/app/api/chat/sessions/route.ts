import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import {
  applyChatCookies,
  getVisitorIdFromRequest,
  listVisitorSessions,
  startNewConversation,
} from "@/lib/chatbot-sessions";

/** All conversations for this browser (the history sidebar). */
async function handleGET(req: NextRequest) {
  const visitorId = getVisitorIdFromRequest(req);
  if (!visitorId) return NextResponse.json({ sessions: [] });
  return NextResponse.json({ sessions: await listVisitorSessions(visitorId) });
}

/** Start a fresh conversation and make it active. */
async function handlePOST(req: NextRequest) {
  const { session, cookiesToSet } = await startNewConversation(req);
  const res = NextResponse.json({
    session: {
      sessionId: session.sessionId,
      title: "New chat",
      messageCount: 0,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    },
  });
  return applyChatCookies(res, cookiesToSet);
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
