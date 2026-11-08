import { withTransport } from "@/lib/security/transport";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getSharedFileByKey, readAttachmentStream } from "@/lib/products/huddle-ai/attachments";
import { getChannel, canAccessChannel } from "@/lib/products/huddle-ai/channels";
import { getConversation, isParticipant } from "@/lib/products/huddle-ai/conversations";
import { getDb } from "@/lib/mongodb";
import { getAnnouncement, canViewAnnouncement } from "@/lib/products/huddle-ai/announcements";
import { recordAudit } from "@/lib/products/huddle-ai/audit";
import type { Attachment } from "@/lib/products/huddle-ai/attachments";

export const dynamic = "force-dynamic";

/**
 * Authenticated streamer for attachments in `uploads/messenger-files/`. Access
 * is re-derived from where the file is referenced — a channel/DM message
 * (`chat_shared_files`) or a published announcement the caller can see. Nothing
 * here is world-readable.
 */
async function handleGET(_req: NextRequest, ctx: RouteContext<"/api/huddle-ai/files/[key]">) {
  const user = await getCurrentChatUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await ctx.params;

  let meta: { name: string; contentType: string; kind: string } | null = null;
  let allowed = false;

  const file = await getSharedFileByKey(key);
  if (file && !file.deletedAt) {
    meta = { name: file.name, contentType: file.contentType, kind: file.kind };
    if (file.scopeType === "channel") {
      const channel = await getChannel(file.scopeId);
      allowed = channel ? await canAccessChannel(channel, user) : false;
    } else {
      const conv = await getConversation(file.scopeId);
      allowed = conv ? isParticipant(conv, user.id) : false;
    }
    if (!allowed) {
      await recordAudit({
        actorId: user.id,
        actorEmail: user.email,
        action: "access_denied",
        entity: "file",
        entityId: file._id,
        entityLabel: file.name,
      });
    }
  } else {
    // Announcement attachment fallback.
    const db = await getDb();
    const ann = await db
      .collection<{ _id: string; attachments: Attachment[] }>("chat_announcements")
      .findOne({ "attachments.storageKey": key, deletedAt: null });
    if (ann) {
      const full = await getAnnouncement(ann._id);
      const att = ann.attachments.find((a) => a.storageKey === key);
      if (full && att && (await canViewAnnouncement(full, user))) {
        meta = { name: att.filename, contentType: att.contentType, kind: att.kind };
        allowed = true;
      }
    }
  }

  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const object = await readAttachmentStream(key);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = meta.kind === "image" || meta.kind === "video" || meta.kind === "voice" ? "inline" : "attachment";
  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(meta.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
