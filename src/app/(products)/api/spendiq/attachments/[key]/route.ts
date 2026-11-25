import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan, prmsMayOpen } from "@/lib/prms-access";
import { INVOICES_COLLECTION } from "@/lib/products/spendiq/invoices";
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

  // the file of a vendor bill
  const bill = req ? null : await db.collection<{ filename?: string }>(INVOICES_COLLECTION).findOne({ storageKey: key, deletedAt: null });
  if (!req && !bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (req ? !prmsMayOpen(user, "requisitions", req.requestedBy?.userId, user.id) : !prmsCan(user, "invoices.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meta: { filename?: string; contentType?: string } | undefined = req ? req.attachments?.find((a) => a.storageKey === key) : { filename: bill!.filename };
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
