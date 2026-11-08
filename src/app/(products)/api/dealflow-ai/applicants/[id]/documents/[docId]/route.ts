import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { applicantDocument } from "@/lib/careers/applicant-profile";
import { readPortalDocStream } from "@/lib/products/clientos/documents";

type Context = { params: Promise<{ id: string; docId: string }> };

/**
 * Staff download of a document shared to an applicant's portal account, for
 * the LMS applicant profile. The document is re-checked to belong to THIS
 * applicant's portal account — never served by id alone.
 */
async function handleGET(_req: Request, { params }: Context) {
  const user = await requireLms("VIEW_CAREERS");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, docId } = await params;
  const doc = await applicantDocument(id, docId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const obj = await readPortalDocStream(doc.storageKey);
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(obj.stream, {
    headers: {
      "Content-Type": doc.contentType || obj.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
