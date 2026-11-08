import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { listLeadMessages } from "@/lib/lead-management/messages";
import { clearLeadPortalUnread } from "@/lib/lead-management/records";

export const dynamic = "force-dynamic";

/**
 * GET /api/dealflow-ai/leads/[id]/messages — the portal-visible thread for one lead,
 * used by the LMS Messages inbox when staff switches conversations (the page
 * itself only preloads conversation summaries, not every lead's full thread).
 * Also clears the lead's "new portal reply" flag — opening a conversation here
 * is the same "staff has now seen this" moment as opening the full lead page.
 */
async function handleGET(_req: Request, ctx: RouteContext<"/api/dealflow-ai/leads/[id]/messages">) {
  const user = await requireLms("VIEW_LEADS");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const messages = await listLeadMessages(id, { visibility: "portal" });
  await clearLeadPortalUnread(id, user.id);
  return NextResponse.json({ messages });
}

export const GET = withTransport(handleGET);
