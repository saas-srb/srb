/**
 * Bill hygiene, the pure part: when are two vendor bills "the same bill"?
 *  - exact: same vendor and the same vendor invoice number once spaces,
 *    dashes, slashes and capitals are ignored (INV-001 = inv 001 = INV/001).
 *    Leading zeros are kept: A01 and A1 are different numbers.
 *  - possible: same vendor, same total and same bill date but a different (or
 *    missing) number. Only worth a look, never a refusal: two real bills can
 *    match like this.
 * Cancelled bills never count.
 */
export interface BillLite {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorInvoiceNumber: string | null;
  invoiceDate: string;
  totalAmount: number;
  status: string;
}

export function normalizeInvoiceRef(ref: string | null | undefined): string | null {
  const n = (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n || null;
}

export interface DuplicateGroup {
  kind: "exact" | "possible";
  vendorName: string;
  bills: BillLite[];
}

export function findDuplicateBills(bills: BillLite[]): DuplicateGroup[] {
  const live = bills.filter((b) => b.status !== "cancelled");
  const groups: DuplicateGroup[] = [];

  const byRef = new Map<string, BillLite[]>();
  for (const b of live) {
    const ref = normalizeInvoiceRef(b.vendorInvoiceNumber);
    if (!ref) continue;
    const k = `${b.vendorId}|${ref}`;
    byRef.set(k, [...(byRef.get(k) ?? []), b]);
  }
  const inExact = new Set<string>();
  for (const list of byRef.values()) {
    if (list.length < 2) continue;
    list.forEach((b) => inExact.add(b.id));
    groups.push({ kind: "exact", vendorName: list[0].vendorName, bills: list });
  }

  const bySame = new Map<string, BillLite[]>();
  for (const b of live) {
    const k = `${b.vendorId}|${b.invoiceDate}|${Math.round(b.totalAmount * 100)}`;
    bySame.set(k, [...(bySame.get(k) ?? []), b]);
  }
  for (const list of bySame.values()) {
    if (list.length < 2) continue;
    if (list.every((b) => inExact.has(b.id)) && new Set(list.map((b) => normalizeInvoiceRef(b.vendorInvoiceNumber))).size === 1) continue; // already reported as exact
    groups.push({ kind: "possible", vendorName: list[0].vendorName, bills: list });
  }
  return groups;
}
