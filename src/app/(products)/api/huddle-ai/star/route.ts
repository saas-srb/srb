import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { requireSession, jsonError, HttpError } from "@/lib/products/huddle-ai/route-helpers";
import { toggleStarredMessage } from "@/lib/products/huddle-ai/users";

export const dynamic = "force-dynamic";

/** POST /api/huddle-ai/star  { messageId } — toggles a personal star. */
async function handlePOST(request: NextRequest) {
  try {
    const user = await requireSession();
    const { messageId } = (await request.json()) as { messageId?: string };
    if (!messageId) throw new HttpError(400, "Missing message.");
    const starred = await toggleStarredMessage(user.id, messageId);
    return Response.json({ starred });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withTransport(handlePOST);
