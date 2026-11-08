import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { resolveScope, requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { saveAttachment } from "@/lib/products/huddle-ai/attachments";

export const dynamic = "force-dynamic";

/**
 * POST /api/huddle-ai/upload  (multipart/form-data)
 *   file:      the file
 *   scopeType: "channel" | "dm"
 *   scopeId:   the channel / conversation id
 *   durationMs?: voice-note length (client-measured)
 *
 * Returns the `Attachment` descriptor to attach to a subsequent message POST.
 * Storing here (not on message send) keeps the send payload small and lets the
 * composer show upload progress + previews before the message exists.
 */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const form = await request.formData();
    const file = form.get("file");
    const scopeType = form.get("scopeType");
    const scopeId = form.get("scopeId");
    const durationMs = form.get("durationMs");

    // Re-check the caller may post here before accepting bytes.
    const resolved = await resolveScope(scopeType, scopeId, user);
    if (!resolved.canPost) throw new HttpError(403, "You can't share files in this conversation.");

    if (!(file instanceof File)) throw new HttpError(400, "No file provided.");
    const attachment = await saveAttachment(file);
    if (durationMs && Number.isFinite(Number(durationMs))) {
      attachment.durationMs = Math.round(Number(durationMs));
    }
    return Response.json({ attachment });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
