import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { advanceChannelRead } from "@/lib/products/huddle-ai/channels";
import { advanceDirectRead } from "@/lib/products/huddle-ai/conversations";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/read  { scopeType, scopeId, seq }  — advances the caller's read cursor. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as { scopeType?: string; scopeId?: string; seq?: number };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    const seq = Number(data.seq);
    if (!Number.isFinite(seq) || seq < 0) throw new HttpError(400, "Invalid position.");

    if (resolved.scope.type === "channel") await advanceChannelRead(resolved.scope.id, user.id, seq);
    else await advanceDirectRead(resolved.scope.id, user.id, seq);

    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
