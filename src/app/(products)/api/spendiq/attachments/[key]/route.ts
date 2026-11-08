import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";
import { readAttachmentStream } from "@/lib/products/spendiq/attachment-storage";
import { getDb } from "@/lib/mongodb";

type Context = { params: Promise<{ key: string }> };

/**
 * Authed streamer for PRMS attachments. Any signed-in PRMS user may fetch a
 * file that is referenced by a requisition they can see (their own, or any
 * if they hold a staff role).
 */
async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentPrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;

  const db = await getDb();
  const req = await db
    .collection<{ requestedBy?: { userId?: string }; attachments?: { storageKey: string; filename: string; contentType: string }[] }>(
      "prms_requisitions"
    )
    .findOne({ "attachments.storageKey": key, deletedAt: null });

  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!hasPrmsStaffRole(user.roles) && req.requestedBy?.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meta = req.attachments?.find((a) => a.storageKey === key);
  const object = await readAttachmentStream(key);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": meta?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(meta?.filename ?? key)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
