import "server-only";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import { maskPhone } from "@/lib/products/agentos/calls/phone";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";

/**
 * The calls placed about one record, for the product's own page (the "Calls" list). Read-only and deliberately small: no
 * transcript, no full phone number. The people who may see the page are decided by the product page that calls this.
 */

export interface TargetCallRow {
  id: string;
  purposeLabel: string;
  status: string;
  at: string;
  scheduledFor: string | null;
  phone: string | null;
  calledBy: string | null;
}

export async function listCallsForTarget(product: string, entityType: string, entityId: string, limit = 25): Promise<TargetCallRow[]> {
  const rows = await (await callsCollection())
    .find({ "target.product": product, "target.entityType": entityType, "target.entityId": entityId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .toArray();
  return rows.map((c) => ({
    id: c._id,
    purposeLabel: PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose,
    status: c.status,
    at: (c.endedAt ?? c.dialedAt ?? c.scheduledFor ?? c.createdAt).toISOString(),
    scheduledFor: c.scheduledFor?.toISOString() ?? null,
    phone: c.phone ? maskPhone(c.phone) : null,
    calledBy: c.initiatedBy?.email ?? null,
  }));
}
