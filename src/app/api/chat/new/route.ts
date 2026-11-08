import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { applyChatCookies, startNewConversation } from "@/lib/chatbot-sessions";

/** Ends the current conversation and issues a fresh session cookie. */
async function handlePOST(req: NextRequest) {
  const { session, cookiesToSet } = await startNewConversation(req);
  const res = NextResponse.json({ sessionId: session.sessionId });
  return applyChatCookies(res, cookiesToSet);
}

export const POST = withTransport(handlePOST);
