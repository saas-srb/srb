"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { postPortalLeadMessage } from "@/lib/lead-management/messages";
import type { LeadMessageAttachment } from "@/lib/lead-management/types";

/**
 * Deliberately takes no `leadId` — it's always the caller's own active lead,
 * derived from the session and ownership-verified inside
 * `postPortalLeadMessage`. The portal is the less-trusted caller, so nothing
 * lead-identifying crosses the client→server boundary as data the server
 * merely checks; it's data the server derives.
 */
export async function sendPortalMessageAction(body: string, attachments: LeadMessageAttachment[] = []): Promise<{ error?: string }> {
  const user = await getCurrentPortalUser();
  if (!user) return { error: "You're not signed in." };
  if (!body.trim() && attachments.length === 0) return { error: "Message is empty." };

  const leadId = user.activeLeadId ?? user.leadId;
  if (!leadId) return { error: "No active lead to message." };

  try {
    await postPortalLeadMessage({ leadId, body, attachments, portalUser: user });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send that message." };
  }

  revalidatePath("/clientos/messages");
  return {};
}
