import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, todayIso } from "@/lib/products/playbook-ai/db";
import { cleanText } from "@/lib/products/playbook-ai/content";
import { canEditSop, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { recordAudit } from "@/lib/products/playbook-ai/audit";
import { notifySopUsers } from "@/lib/products/playbook-ai/notifications";
import { sopCan } from "@/lib/sop-roles";
import type { FeedbackDoc, SopDoc, SopViewer } from "@/lib/products/playbook-ai/types";

/**
 * Employee feedback / change requests on an SOP. This is a suggestion box, not
 * an approval gate: nothing here blocks or gates publishing. The owner is
 * notified and an editor marks the item resolved.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function col() {
  const db = await getDb();
  const c = db.collection<FeedbackDoc>(COLLECTIONS.feedback);
  await c.createIndex({ sopId: 1, createdAt: -1 }).catch(() => {});
  return c;
}

export async function submitFeedback(
  v: SopViewer,
  sop: SopDoc,
  input: { kind: string; message: string }
): Promise<Result> {
  if (!sopCan({ roles: v.roles, permissionOverrides: v.overrides }, "VIEW")) return { ok: false, error: "You can't submit feedback." };
  const message = cleanText(input.message, 2000).trim();
  if (message.length < 5) return { ok: false, error: "Write a little more detail (at least 5 characters)." };
  const kind = input.kind === "change_request" ? "change_request" : "feedback";
  const c = await col();
  const recent = await c.countDocuments({ userId: v.userId, createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } });
  if (recent >= 10) return { ok: false, error: "You've sent a lot of feedback in the last hour — please try again later." };

  const doc: FeedbackDoc = {
    _id: newId(),
    sopId: sop._id,
    sopCode: sop.code,
    sopTitle: sop.title,
    kind,
    message,
    userId: v.userId,
    userName: v.name,
    version: sop.version,
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date(),
  };
  await c.insertOne(doc);
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "feedback",
    entity: "feedback",
    entityId: doc._id,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `${kind === "change_request" ? "Change request" : "Feedback"}: ${message.slice(0, 120)}`,
  });
  await notifySopUsers([sop.ownerId].filter((id) => id !== v.userId), {
    type: "sop_feedback",
    title: `${kind === "change_request" ? "Change request" : "Feedback"} on ${sop.code}`,
    body: `${v.name}: ${message.slice(0, 140)}`,
    link: `/playbook-ai/library/${sop._id}?tab=feedback`,
  });
  return { ok: true };
}

export async function listFeedback(sopId: string): Promise<FeedbackDoc[]> {
  return (await col()).find({ sopId }).sort({ createdAt: -1 }).limit(100).toArray();
}

/** The viewer's own submissions on an SOP (what an ordinary reader sees). */
export async function listOwnFeedback(sopId: string, userId: string): Promise<FeedbackDoc[]> {
  return (await col()).find({ sopId, userId }).sort({ createdAt: -1 }).limit(20).toArray();
}

export async function resolveFeedback(v: SopViewer, sop: SopDoc, feedbackId: string, note: string): Promise<Result> {
  if (!canEditSop(v, toAccessDoc(sop, todayIso()))) return { ok: false, error: "You can't resolve feedback on this SOP." };
  const c = await col();
  const res = await c.findOneAndUpdate(
    { _id: feedbackId, sopId: sop._id, status: "open" },
    { $set: { status: "resolved", resolvedBy: v.userId, resolvedAt: new Date(), resolutionNote: cleanText(note, 500).trim() || null } },
    { returnDocument: "after" }
  );
  if (!res) return { ok: false, error: "That item was already resolved." };
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "feedback",
    entity: "feedback",
    entityId: feedbackId,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: "Marked feedback resolved",
  });
  await notifySopUsers([res.userId], {
    type: "sop_feedback",
    title: `Your feedback on ${sop.code} was addressed`,
    body: res.resolutionNote ?? "The owner marked it resolved.",
    link: `/playbook-ai/library/${sop._id}?tab=feedback`,
  });
  return { ok: true };
}

export async function openFeedbackCounts(sopIds: string[]): Promise<Map<string, number>> {
  const c = await col();
  const rows = await c.aggregate<{ _id: string; n: number }>([{ $match: { sopId: { $in: sopIds }, status: "open" } }, { $group: { _id: "$sopId", n: { $sum: 1 } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}
