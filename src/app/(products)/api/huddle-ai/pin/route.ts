import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { pinMessage, unpinMessage } from "@/lib/products/huddle-ai/channels";
import { recordAudit } from "@/lib/products/huddle-ai/audit";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/pin  { scopeType, scopeId, messageId, pinned } — channel only. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as { scopeType?: string; scopeId?: string; messageId?: string; pinned?: boolean };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (resolved.scope.type !== "channel" || !resolved.channel) throw new HttpError(400, "Only channel messages can be pinned.");
    if (!data.messageId) throw new HttpError(400, "Missing message.");
    if (!resolved.canPost) throw new HttpError(403, "You must be a member to pin messages.");

    if (data.pinned === false) {
      await unpinMessage(resolved.channel._id, data.messageId, user.id);
      await recordAudit({ actorId: user.id, actorEmail: user.email, action: "unpin", entity: "message", entityId: data.messageId, entityLabel: resolved.channel.name });
    } else {
      await pinMessage(resolved.channel._id, data.messageId, user.id);
      await recordAudit({ actorId: user.id, actorEmail: user.email, action: "pin", entity: "message", entityId: data.messageId, entityLabel: resolved.channel.name });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
