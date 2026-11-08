import { withTransport } from "@/lib/security/transport";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { requireLms } from "@/lib/lms-auth";
import { getLeadRecord } from "@/lib/lead-management/records";
import { readLeadAttachmentStream } from "@/lib/lead-management/attachment-storage";
import type { LeadMessage } from "@/lib/lead-management/types";

export const dynamic = "force-dynamic";

/**
 * Authenticated streamer for attachments in `uploads/lead-message-files/`.
 * Access is always re-derived from the `lead_messages` doc that owns the
 * storage key — never from a client-supplied leadId (there isn't one; the
 * route only takes `[key]`).
 *
 * A portal session may only read a file whose OWNING MESSAGE is
 * `visibility: "portal"` on a lead they own — `postLeadMessage` is shared by
 * internal staff-only notes too, and a portal user must never read an
 * attachment on a note about them that staff never sent them.
 *
 * An LMS session may read any lead's attachment (matches the existing
 * no-fine-grained-role convention on the rest of `/dealflow-ai/leads`).
 */
async function handleGET(_req: NextRequest, ctx: RouteContext<"/api/lead-messages/files/[key]">) {
  const { key } = await ctx.params;
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = await getDb();
  const message = await db.collection<LeadMessage>("lead_messages").findOne({ "attachments.storageKey": key });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const attachment = message.attachments.find((a) => a.storageKey === key);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = false;
  const portalUser = await getCurrentPortalUser();
  if (portalUser) {
    const lead = await getLeadRecord(message.leadId);
    allowed = message.visibility === "portal" && !!lead && lead.externalUserId === portalUser.id;
  }
  if (!allowed) {
    const lmsUser = await requireLms("VIEW_LEADS");
    allowed = !!lmsUser;
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const object = await readLeadAttachmentStream(key);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "voice" ? "inline" : "attachment";
  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
