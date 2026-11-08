import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewCommercialFinance, canViewPayrollFinance } from "@/lib/fms-roles";
import { readAttachmentStream } from "@/lib/products/cashflow-ai/attachment-storage";
import { getDb } from "@/lib/mongodb";

type Context = { params: Promise<{ key: string }> };

/**
 * Authed streamer for FMS attachments. Any signed-in FMS user may fetch a
 * file referenced by a transaction — FMS has no employee self-service tier
 * in Phase 1, so every FMS session is staff.
 */
async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentFmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCommercialFinance(user) && !canViewPayrollFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { key } = await params;

  const db = await getDb();
  type Stored = { storageKey: string; filename: string; contentType: string };
  const txn = await db.collection<{ attachments?: Stored[] }>("fms_transactions").findOne({ "attachments.storageKey": key, deletedAt: null });
  // proof documents added to a customer receipt
  const receipt = txn ? null : await db.collection<{ documents?: Stored[] }>("fms_receipts").findOne({ "documents.storageKey": key, deletedAt: null });

  if (!txn && !receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = (txn?.attachments ?? receipt?.documents)?.find((a) => a.storageKey === key);
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
