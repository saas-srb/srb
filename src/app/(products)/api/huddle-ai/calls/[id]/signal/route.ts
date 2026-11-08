import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { requireCallAccess } from "@/lib/products/huddle-ai/call-guard";
import { emit } from "@/lib/products/huddle-ai/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/huddle-ai/calls/[id]/signal  { to, type: "offer"|"answer"|"ice"|"bye", data }
 * Relays one WebRTC signaling payload to a specific peer over the call event log.
 * Short TTL — ICE candidates are high-volume and disposable.
 */
async function handlePOST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user } = await requireCallAccess(id);
    const body = (await request.json()) as { to?: string; type?: string; data?: unknown };

    if (!body.to || !["offer", "answer", "ice", "bye"].includes(body.type ?? "")) {
      throw new HttpError(400, "Bad signal.");
    }

    await emit({
      scope: { type: "call", id },
      kind: "call_signal",
      payload: { from: user.id, to: body.to, type: body.type, data: body.data ?? null },
      actorId: user.id,
      ttlSeconds: 30,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
