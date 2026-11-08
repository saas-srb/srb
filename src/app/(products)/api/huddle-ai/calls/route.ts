import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { startCall, getActiveCallForScope, serializeCall, getIceServers } from "@/lib/products/huddle-ai/calls";
import type { CallMode } from "@/lib/products/huddle-ai/call-constants";

export const dynamic = "force-dynamic";

/** GET /api/huddle-ai/calls?scopeType=&scopeId=  — the active call for a conversation, if any. */
async function handleGET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const resolved = await resolveScope(sp.get("scopeType"), sp.get("scopeId"), user);
    const call = await getActiveCallForScope(resolved.scope);
    return Response.json({ call: call ? await serializeCall(call, user.id) : null });
  } catch (err) {
    return jsonError(err);
  }
}

/** POST /api/huddle-ai/calls  { scopeType, scopeId, mode, meetingId? }  — start (or reuse) a call. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as { scopeType?: string; scopeId?: string; mode?: CallMode; meetingId?: string | null };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (!resolved.canPost) throw new HttpError(403, "You can't start a call here.");

    const mode: CallMode = data.mode === "audio" ? "audio" : "video";
    const result = await startCall({
      scope: resolved.scope,
      mode,
      initiatorId: user.id,
      meetingId: typeof data.meetingId === "string" ? data.meetingId : null,
    });
    if (!result.ok) throw new HttpError(400, result.error);

    return Response.json({
      callId: result.call._id,
      reused: result.reused,
      iceServers: (await getIceServers()),
      call: await serializeCall(result.call, user.id),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
