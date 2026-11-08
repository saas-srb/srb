import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { BILLS as BILLS_COLLECTION } from "@/lib/products/cashflow-ai/accrual/posting";
import { GST_ITC_COLLECTION, loadInwardRows, loadRegistration } from "@/lib/products/cashflow-ai/gst/store";
import type { InwardRow, Registration } from "@/lib/products/cashflow-ai/gst/core";

/** The month's purchase rows plus what InwardRow does not carry: each bill's note and vendor id (for the link to the vendor). */
export interface PurchasesView {
  registration: Registration;
  rows: InwardRow[];
  notes: Map<string, string>;
  vendorIds: Map<string, string>;
}

export async function loadPurchasesView(month: string): Promise<PurchasesView> {
  const registration = await loadRegistration();
  const rows = await loadInwardRows(month, registration);
  const ids = rows.map((r) => r.billId);
  const notes = new Map<string, string>();
  const vendorIds = new Map<string, string>();
  if (ids.length) {
    const db = await getDb();
    const [recs, bills] = await Promise.all([
      db.collection(GST_ITC_COLLECTION).find({ billId: { $in: ids }, ...notDeleted }).project({ billId: 1, note: 1 }).toArray(),
      db.collection(BILLS_COLLECTION).find({ _id: { $in: ids as never[] } }).project({ vendorId: 1 }).toArray(),
    ]);
    for (const r of recs) if (r.note) notes.set(String(r.billId), String(r.note));
    for (const b of bills) vendorIds.set(String(b._id), String(b.vendorId));
  }
  return { registration, rows, notes, vendorIds };
}
