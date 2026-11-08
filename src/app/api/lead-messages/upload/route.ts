import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { requireLms } from "@/lib/lms-auth";
import { getLeadRecord } from "@/lib/lead-management/records";
import { saveLeadAttachment } from "@/lib/lead-management/attachment-storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/lead-messages/upload  (multipart/form-data: `file`, `leadId`)
 *
 * Returns the attachment descriptor to include in a subsequent send action —
 * same decoupled upload-then-send flow as `/api/huddle-ai/upload`.
 *
 * `leadId` is only ever TRUSTED from an LMS session (any staff, matching this
 * codebase's existing no-fine-grained-role convention on Lead Management). A
 * portal caller's `leadId` is always derived from their own session and
 * ownership-verified — never taken from the form — since the portal is the
 * less-trusted caller and a client-supplied leadId here would let someone
 * attach files to a thread they don't own.
 */
async function handlePOST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const portalUser = await getCurrentPortalUser();
    if (portalUser) {
      const leadId = portalUser.activeLeadId ?? portalUser.leadId;
      const lead = leadId ? await getLeadRecord(leadId) : null;
      if (!lead || lead.externalUserId !== portalUser.id) {
        return NextResponse.json({ error: "You don't have an active lead to attach files to." }, { status: 403 });
      }
      const attachment = await saveLeadAttachment(file);
      return NextResponse.json({ attachment });
    }

    const lmsUser = await requireLms("MESSAGE_LEADS");
    if (lmsUser) {
      const leadId = form.get("leadId");
      if (typeof leadId !== "string" || !leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });
      const attachment = await saveLeadAttachment(file);
      return NextResponse.json({ attachment });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withTransport(handlePOST);
