import { NextRequest } from "next/server";
import { abortPublicSession, finishPublicSession } from "@/lib/products/agentos/calls/public";
import { publicErrorResponse, publicJson, publicRequestContext } from "@/lib/products/agentos/calls/public-request";

import { withTransport } from "@/lib/security/transport";
/** POST /api/agentos-public/session/finish: the visitor's browser reports the ElevenLabs conversation id of its call (needs the session key). */
export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  try {
    const ctx = publicRequestContext(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // No conversation id + abort: the browser could not connect, so the minutes set aside for this session are given back.
    if (body?.abort === true && !body.conversationId) return publicJson({ ...(await abortPublicSession({ sessionId: body.sessionId, sessionKey: body.sessionKey, ip: ctx.ip })) });
    const r = await finishPublicSession({ sessionId: body?.sessionId, sessionKey: body?.sessionKey, conversationId: body?.conversationId, ip: ctx.ip });
    return publicJson({ ...r });
  } catch (e) {
    return publicErrorResponse(e);
  }
}

export const POST = withTransport(handlePOST);
