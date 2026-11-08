import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import type { LossKind, LossLine } from "@/lib/products/cashflow-ai/income-tax/core";
import { lossProblem, type LossInput } from "@/lib/products/cashflow-ai/income-tax/registers-core";

/**
 * The register of losses the company's CA says can be carried forward. The yearly computation page reads it through listLosses()
 * and lets the company choose how much of each to set off. The time limit for using a loss is the CA's: the company types the last
 * year, nothing is worked out here.
 */
export const IT_LOSSES_COLLECTION = "fms_it_losses";
/** Written by the yearly computation: each year's document lists the set-offs it chose. */
const IT_YEARS_COLLECTION = "fms_it_years";

type Actor = { id: string; email: string | null };
type Result = { ok: true } | { ok: false; error: string };

export interface LossDoc extends AuditFields {
  _id: string;
  fy: string;
  kind: LossKind;
  amount: number;
  available: number;
  validUntilFy: string | null;
  note: string | null;
}

const col = async () => (await getDb()).collection<LossDoc>(IT_LOSSES_COLLECTION);

/** Full documents for the register page. */
export async function listLossDocs(): Promise<LossDoc[]> {
  return (await col()).find({ ...notDeleted }).sort({ fy: 1, kind: 1 }).toArray();
}

/** The shape the computation page needs. */
export async function listLosses(): Promise<LossLine[]> {
  return (await listLossDocs()).map((d) => ({ id: d._id, fy: d.fy, kind: d.kind, available: d.available, validUntilFy: d.validUntilFy }));
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function cleaned(i: LossInput): LossInput {
  return { ...i, amount: money(i.amount), available: money(i.available), validUntilFy: i.validUntilFy || null, note: i.note?.trim() || null };
}
const label = (d: { fy: string; kind: LossKind }) => `${d.kind.replace(/_/g, " ")} loss of ${d.fy}`;

export async function saveLoss(id: string | null, raw: LossInput, actor: Actor): Promise<Result> {
  const c = cleaned(raw);
  const bad = lossProblem(c);
  if (bad) return { ok: false, error: bad };
  const c1 = await col();
  const summary = `${c.fy}, original ${c.amount}, available ${c.available}${c.validUntilFy ? `, usable until ${c.validUntilFy}` : ""}`;
  if (id) {
    const res = await c1.updateOne({ _id: id, ...notDeleted }, { $set: { ...c, ...updateStamp(actor.id) } });
    if (res.matchedCount === 0) return { ok: false, error: "Loss not found." };
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "it_loss", entityId: `it-loss:${id}`, entityLabel: `Income-tax ${label(c)}`, summary });
  } else {
    const _id = newId();
    await c1.insertOne({ _id, ...c, ...createStamp(actor.id) });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "it_loss", entityId: `it-loss:${_id}`, entityLabel: `Income-tax ${label(c)}`, summary });
  }
  return { ok: true };
}

/** A loss already set off in some year's computation cannot be removed, or that year's figures would change under it. Fail-soft: no computation data, nothing to guard. */
async function usedInComputation(id: string): Promise<boolean> {
  try {
    return (await (await getDb()).collection(IT_YEARS_COLLECTION).countDocuments({ "setOffs.lossId": id })) > 0;
  } catch {
    return false;
  }
}

export async function removeLoss(id: string, actor: Actor): Promise<Result> {
  const c1 = await col();
  const doc = await c1.findOne({ _id: id, ...notDeleted });
  if (!doc) return { ok: false, error: "Loss not found." };
  if (await usedInComputation(id)) return { ok: false, error: "This loss is used in a yearly tax working. Remove that set-off on the Tax for the year page first, or reduce the amount available instead." };
  await c1.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "it_loss", entityId: `it-loss:${id}`, entityLabel: `Income-tax ${label(doc)}` });
  return { ok: true };
}
