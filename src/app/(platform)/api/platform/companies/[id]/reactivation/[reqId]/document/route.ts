import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { readIdDocument } from "@/lib/platform/reactivation";
import { recordPlatformAudit } from "@/lib/platform/audit";

type Context = { params: Promise<{ id: string; reqId: string }> };

/** The government ID of a reactivation request, for Console users who may change company status. Every view is audited. */
async function handleGET(_req: Request, { params }: Context) {
  const auth = await checkPlatformPermission("companies.status");
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, reqId } = await params;
  const doc = await readIdDocument(reqId);
  if (!doc || doc.companyId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordPlatformAudit({ actorId: auth.user.id, action: "reactivation.view-id", target: { type: "company", id }, companyId: id, details: { reference: `RA-${reqId.slice(0, 8).toUpperCase()}` } });
  const ext = doc.type === "application/pdf" ? "pdf" : doc.type.split("/")[1];
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.type,
      "Content-Disposition": `inline; filename="id-${reqId.slice(0, 8)}.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export const GET = withTransport(handleGET);
