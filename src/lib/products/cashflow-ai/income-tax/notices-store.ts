import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";
import { noticeEventProblem, noticeProblem, sortNotices, NOTICE_STATUSES, type NoticeInput, type NoticeStatus } from "@/lib/products/cashflow-ai/income-tax/registers-core";

/**
 * Income-tax notices the company has received. This only tracks them: replying is for the company and its CA. The reply-due date is
 * typed from the notice itself.
 */
export const IT_NOTICES_COLLECTION = "fms_it_notices";

type Actor = { id: string; email: string | null };
type Result = { ok: true } | { ok: false; error: string };

export interface NoticeEvent {
  id: string;
  date: string;
  text: string;
  by: string | null;
  at: Date;
}

export interface NoticeDoc extends AuditFields, NoticeInput {
  _id: string;
  /** Append-only: events are never edited or removed. */
  events: NoticeEvent[];
}

const col = async () => (await getDb()).collection<NoticeDoc>(IT_NOTICES_COLLECTION);

export async function listNotices(): Promise<NoticeDoc[]> {
  return sortNotices(await (await col()).find({ ...notDeleted }).toArray());
}

function cleaned(i: NoticeInput): NoticeInput {
  return { type: (i.type ?? "").trim(), reference: i.reference?.trim() || null, fy: i.fy || null, receivedOn: i.receivedOn, responseDueOn: i.responseDueOn || null, status: i.status, amountDemanded: i.amountDemanded ?? null, note: i.note?.trim() || null };
}
const label = (n: { type: string; reference: string | null }) => `Income-tax notice ${n.type}${n.reference ? ` (${n.reference})` : ""}`;

/** Creates a notice, or updates its details and status. Events are untouched here. */
export async function saveNotice(id: string | null, raw: NoticeInput, actor: Actor, today: string = todayIst()): Promise<Result> {
  const c = cleaned(raw);
  const bad = noticeProblem(c, today);
  if (bad) return { ok: false, error: bad };
  const col1 = await col();
  const summary = `${c.status}, received ${c.receivedOn}, reply due ${c.responseDueOn ?? "not entered"}`;
  if (id) {
    const before = await col1.findOne({ _id: id, ...notDeleted });
    if (!before) return { ok: false, error: "Notice not found." };
    await col1.updateOne({ _id: id }, { $set: { ...c, ...updateStamp(actor.id) } });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: before.status !== c.status ? "status_change" : "update", entity: "it_notice", entityId: `it-notice:${id}`, entityLabel: label(c), summary: before.status !== c.status ? `status: ${before.status} → ${c.status}; ${summary}` : summary });
  } else {
    const _id = newId();
    await col1.insertOne({ _id, ...c, events: [], ...createStamp(actor.id) });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "it_notice", entityId: `it-notice:${_id}`, entityLabel: label(c), summary });
  }
  return { ok: true };
}

/** Quick status change without retyping the notice. */
export async function setNoticeStatus(id: string, status: NoticeStatus, actor: Actor): Promise<Result> {
  if (!NOTICE_STATUSES.includes(status)) return { ok: false, error: "Choose the status of the notice." };
  const c = await col();
  const before = await c.findOne({ _id: id, ...notDeleted });
  if (!before) return { ok: false, error: "Notice not found." };
  if (before.status === status) return { ok: true };
  await c.updateOne({ _id: id }, { $set: { status, ...updateStamp(actor.id) } });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "status_change", entity: "it_notice", entityId: `it-notice:${id}`, entityLabel: label(before), summary: `status: ${before.status} → ${status}` });
  return { ok: true };
}

/** Adds a dated line to the notice's history (reply sent, hearing attended, ...). Lines are only ever added. */
export async function addNoticeEvent(id: string, input: { date: string; text: string }, actor: Actor, today: string = todayIst()): Promise<Result> {
  const bad = noticeEventProblem(input, today);
  if (bad) return { ok: false, error: bad };
  const c = await col();
  const event: NoticeEvent = { id: newId(), date: input.date, text: input.text.trim(), by: actor.id, at: new Date() };
  const res = await c.updateOne({ _id: id, ...notDeleted }, { $push: { events: event }, $set: updateStamp(actor.id) });
  if (res.matchedCount === 0) return { ok: false, error: "Notice not found." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "it_notice", entityId: `it-notice:${id}`, entityLabel: "Income-tax notice update added", summary: `${event.date}: ${event.text.slice(0, 200)}` });
  return { ok: true };
}
