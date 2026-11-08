import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import {
  postMessage,
  editMessage,
  softDeleteMessage,
  listMessages,
  listThread,
} from "@/lib/products/huddle-ai/messages";
import { getChatUser } from "@/lib/products/huddle-ai/users";
import { advanceChannelRead } from "@/lib/products/huddle-ai/channels";
import { advanceDirectRead } from "@/lib/products/huddle-ai/conversations";
import type { Attachment } from "@/lib/products/huddle-ai/attachments";

export const dynamic = "force-dynamic";

/** GET  /api/huddle-ai/messages?scopeType=&scopeId=&beforeSeq=&threadRootId= */
async function handleGET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const resolved = await resolveScope(sp.get("scopeType"), sp.get("scopeId"), user);
    const me = await getChatUser(user.id);
    const starredIds = me?.starredMessageIds ?? [];

    const threadRootId = sp.get("threadRootId");
    if (threadRootId) {
      const messages = await listThread(resolved.scope, threadRootId, user.id, starredIds);
      return Response.json({ messages });
    }

    const beforeSeq = sp.get("beforeSeq") ? Number(sp.get("beforeSeq")) : undefined;
    const messages = await listMessages({
      scope: resolved.scope,
      viewerId: user.id,
      starredIds,
      beforeSeq: Number.isFinite(beforeSeq) ? beforeSeq : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return Response.json({ messages });
  } catch (err) {
    return jsonError(err);
  }
}

/** POST /api/huddle-ai/messages  { scopeType, scopeId, body, attachments?, mentions?, parentId? } */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as {
      scopeType?: string;
      scopeId?: string;
      body?: string;
      attachments?: Attachment[];
      mentions?: string[];
      parentId?: string | null;
    };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (!resolved.canPost) throw new HttpError(403, "You can't post in this conversation.");

    const message = await postMessage({
      scope: resolved.scope,
      authorId: user.id,
      body: data.body ?? "",
      attachments: Array.isArray(data.attachments) ? data.attachments.slice(0, 10) : [],
      mentions: Array.isArray(data.mentions) ? data.mentions : [],
      parentId: typeof data.parentId === "string" ? data.parentId : null,
    });

    // Posting marks the conversation read up to this message for the author.
    if (resolved.scope.type === "channel") await advanceChannelRead(resolved.scope.id, user.id, message.seq);
    else await advanceDirectRead(resolved.scope.id, user.id, message.seq);

    return Response.json({ message });
  } catch (err) {
    return jsonError(err);
  }
}

/** PATCH /api/huddle-ai/messages  { scopeType, scopeId, messageId, body, attachments? } */
async function handlePATCH(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as {
      scopeType?: string;
      scopeId?: string;
      messageId?: string;
      body?: string;
      attachments?: Attachment[];
    };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (!data.messageId) throw new HttpError(400, "Missing message.");
    const message = await editMessage(resolved.scope, data.messageId, user.id, data.body ?? "", data.attachments);
    return Response.json({ message });
  } catch (err) {
    return jsonError(err);
  }
}

/** DELETE /api/huddle-ai/messages  { scopeType, scopeId, messageId } */
async function handleDELETE(request: NextRequest) {
  try {
    const user = await requireSession();
    const data = (await request.json()) as { scopeType?: string; scopeId?: string; messageId?: string };
    const resolved = await resolveScope(data.scopeType, data.scopeId, user);
    if (!data.messageId) throw new HttpError(400, "Missing message.");
    await softDeleteMessage(resolved.scope, data.messageId, { id: user.id, isModerator: resolved.isModerator });
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
export const PATCH = withTransport(handlePATCH);
export const DELETE = withTransport(handleDELETE);
