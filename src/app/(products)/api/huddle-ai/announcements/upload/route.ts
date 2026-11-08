import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { canPostAnnouncements } from "@/lib/messenger-roles";
import { saveAttachment } from "@/lib/products/huddle-ai/attachments";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/announcements/upload (multipart) — author-only attachment upload. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!canPostAnnouncements(user)) throw new HttpError(403, "You can't post announcements.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file provided.");
    const attachment = await saveAttachment(file);
    return Response.json({ attachment });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
