import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { forwardMessage } from "@/lib/products/huddle-ai/messages";
import { advanceChannelRead } from "@/lib/products/huddle-ai/channels";
import { advanceDirectRead } from "@/lib/products/huddle-ai/conversations";
import { getChatUsers } from "@/lib/products/huddle-ai/users";

export const dynamic = "force-dynamic";

/**
 * POST /api/huddle-ai/messages/[id]/forward
 *   { fromScopeType, fromScopeId, toScopeType, toScopeId }
 * Copies the message into the target conversation as a "Forwarded from …" post.
 */
async function handlePOST(request: NextRequest, ctx: RouteContext<"/api/huddle-ai/messages/[id]/forward">) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const data = (await request.json()) as {
      fromScopeType?: string;
      fromScopeId?: string;
      toScopeType?: string;
      toScopeId?: string;
    };

    const from = await resolveScope(data.fromScopeType, data.fromScopeId, user);
    const to = await resolveScope(data.toScopeType, data.toScopeId, user);
    if (!from.canRead) throw new HttpError(403, "You can't read the original message.");
    if (!to.canPost) throw new HttpError(403, "You can't post in the target conversation.");

    let sourceLabel = "a direct message";
    if (from.channel) sourceLabel = `#${from.channel.name}`;
    else if (from.conversation) {
      const otherId = from.conversation.participantIds.find((p) => p !== user.id);
      const users = otherId ? await getChatUsers([otherId]) : {};
      sourceLabel = otherId ? `your DM with ${users[otherId]?.displayName ?? "someone"}` : "a direct message";
    }

    const message = await forwardMessage({
      source: from.scope,
      messageId: id,
      target: to.scope,
      actorId: user.id,
      sourceLabel,
    });

    if (to.scope.type === "channel") await advanceChannelRead(to.scope.id, user.id, message.seq);
    else await advanceDirectRead(to.scope.id, user.id, message.seq);

    return Response.json({ message, target: { type: to.scope.type, id: to.scope.id } });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
