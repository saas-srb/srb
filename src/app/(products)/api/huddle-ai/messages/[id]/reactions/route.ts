import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { toggleReaction } from "@/lib/products/huddle-ai/messages";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/messages/[id]/reactions  { scopeType, scopeId, emoji } */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/huddle-ai/messages/[id]/reactions">) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const data = (await request.json()) as { scopeType?: string; scopeId?: string; emoji?: string };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (!resolved.canPost) throw new HttpError(403, "You can't react in this conversation.");
    if (!data.emoji) throw new HttpError(400, "Missing emoji.");
    const result = await toggleReaction(resolved.scope, id, user.id, data.emoji);
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
