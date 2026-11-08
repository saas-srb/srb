import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError } from "@/lib/products/huddle-ai/route-helpers";
import { emit } from "@/lib/products/huddle-ai/events";
import { getChatUser } from "@/lib/products/huddle-ai/users";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/typing  { scopeType, scopeId }  — emits an ephemeral typing ping. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as { scopeType?: string; scopeId?: string };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    const me = await getChatUser(user.id);
    await emit({
      scope: resolved.scope,
      kind: "typing",
      payload: { userId: user.id, displayName: me?.displayName ?? "Someone" },
      actorId: user.id,
      ttlSeconds: 8,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
