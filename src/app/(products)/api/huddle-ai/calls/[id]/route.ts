import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { requireCallAccess } from "@/lib/products/huddle-ai/call-guard";
import {
  serializeCall,
  joinCall,
  declineCall,
  leaveCall,
  endCall,
  setHand,
  sendReaction,
  broadcastMediaState,
  heartbeat,
  setScreenShare,
  inviteToCall,
  getIceServers,
  activeRoster,
  getCall,
} from "@/lib/products/huddle-ai/calls";
import type { ScreenSurface } from "@/lib/products/huddle-ai/call-constants";

export const dynamic = "force-dynamic";

/** GET /api/huddle-ai/calls/[id] — full room state (roster, hands, presenter, timer). */
async function handleGET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, call } = await requireCallAccess(id);
    return Response.json({
      call: await serializeCall(call, user.id),
      roster: await activeRoster(id),
      iceServers: (await getIceServers()),
    });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * POST /api/huddle-ai/calls/[id]  { action, ... }
 *   join · decline · leave · end · heartbeat
 *   hand { raised } · reaction { emoji } · screen { on, surface } · invite { userIds }
 */
async function handlePOST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user } = await requireCallAccess(id);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      raised?: boolean;
      emoji?: string;
      on?: boolean;
      surface?: ScreenSurface;
      userIds?: string[];
      micOn?: boolean;
      camOn?: boolean;
    };

    switch (body.action) {
      case "join": {
        const r = await joinCall(id, user.id);
        if (!r.ok) throw new HttpError(400, r.error);
        const call = await getCall(id);
        return Response.json({
          ok: true,
          call: call ? await serializeCall(call, user.id) : null,
          roster: await activeRoster(id),
          iceServers: (await getIceServers()),
        });
      }
      case "decline":
        await declineCall(id, user.id);
        return Response.json({ ok: true });
      case "leave":
        await leaveCall(id, user.id);
        return Response.json({ ok: true });
      case "end":
        await endCall(id, user.id, "hangup");
        return Response.json({ ok: true });
      case "heartbeat":
        await heartbeat(id, user.id);
        return Response.json({ ok: true, roster: await activeRoster(id) });
      case "hand":
        await setHand(id, user.id, body.raised !== false);
        return Response.json({ ok: true });
      case "reaction":
        if (!body.emoji) throw new HttpError(400, "Missing emoji.");
        await sendReaction(id, user.id, body.emoji);
        return Response.json({ ok: true });
      case "media":
        await broadcastMediaState(id, user.id, body.micOn !== false, body.camOn === true);
        return Response.json({ ok: true });
      case "screen":
        await setScreenShare(id, user.id, body.on === true, (body.surface ?? "unknown") as ScreenSurface);
        return Response.json({ ok: true });
      case "invite": {
        const r = await inviteToCall(id, Array.isArray(body.userIds) ? body.userIds : [], user.id);
        if (!r.ok) throw new HttpError(400, r.error ?? "Could not invite.");
        return Response.json({ ok: true });
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  } catch (err) {
    return jsonError(err);
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
