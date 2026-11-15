import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { notifyUsers } from "@/lib/notify";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { decideRequest, cleanMessage, type LockedTarget } from "@/lib/products/commandos/access-requests-rules";

const COLLECTION = "access_requests";

export interface AccessRequest {
  _id: string;
  userId: string;
  email: string;
  name: string;
  itemKey: string;
  label: string;
  product: string | null;
  message: string;
  status: "open" | "granted" | "dismissed";
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

async function col() {
  const c = (await getDb()).collection<AccessRequest>(COLLECTION);
  c.createIndex({ status: 1, createdAt: -1 }).catch(() => {});
  return c;
}

/** The company's Directors who can sign in: who can grant access. */
export async function listDirectors(): Promise<{ id: string; name: string; email: string }[]> {
  const rows = await (await getDb()).collection<{ _id: ObjectId; name?: string; email: string }>("admin_users")
    .find({ roles: "super_admin", status: { $nin: BLOCKED_STATUSES } }, { projection: { name: 1, email: 1 } }).limit(20).toArray();
  return rows.map((r) => ({ id: String(r._id), name: r.name ?? "", email: r.email }));
}

export type RequestResult = { ok: true; id: string; emailed: boolean } | { ok: false; error: string; reason?: string };

/** Records the request, tells the Directors in their bell and by email (when email is set up). Never throws. */
export async function createAccessRequest(user: { id: string; email: string; name?: string }, target: LockedTarget, message: unknown, origin: string): Promise<RequestResult> {
  try {
    const c = await col();
    const open = await c.findOne({ userId: user.id, itemKey: target.itemKey, label: target.label, status: "open" }, { sort: { createdAt: -1 } });
    const recentCount = await c.countDocuments({ userId: user.id, createdAt: { $gt: new Date(Date.now() - 3_600_000) } });
    const decision = decideRequest({ openForItemAt: open?.createdAt ?? null, recentCount });
    if (!decision.ok) return { ok: false, error: decision.message, reason: decision.reason };
    const doc: AccessRequest = {
      _id: randomUUID(), userId: user.id, email: user.email, name: user.name ?? "", itemKey: target.itemKey, label: target.label, product: target.product,
      message: cleanMessage(message), status: "open", createdAt: new Date(), resolvedAt: null, resolvedBy: null,
    };
    await c.insertOne(doc);
    const directors = await listDirectors();
    const who = user.name || user.email;
    const title = `${who} asked for access to ${target.label}`;
    try {
      await notifyUsers("workspace", directors.map((d) => d.id).filter((i) => i !== user.id), { type: "workspace_event", title, body: doc.message || "Open People & access to review the request.", link: "/commandos/users", dedupeKey: `access-request:${doc._id}` });
    } catch (err) {
      console.error("[access-request] bell failed", err instanceof Error ? err.message : err);
    }
    let emailed = false;
    for (const d of directors.filter((x) => x.id !== user.id)) {
      try {
        const { html, text } = renderEmail({ brand: "Workspace", heading: "Someone asked for access", paragraphs: [`${who} (${user.email}) asked for access to ${target.label}.`, ...(doc.message ? [`They wrote: ${doc.message}`] : [])], action: { label: "Review in People & access", url: `${origin}/commandos/users` } });
        const r = await sendEmail({ to: d.email, subject: title, html, text });
        emailed = emailed || r.ok;
      } catch {
        /* email is optional: the bell and the list are the record */
      }
    }
    return { ok: true, id: doc._id, emailed };
  } catch (err) {
    console.error("[access-request] failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "Could not send the request just now. Try again shortly." };
  }
}

export async function listAccessRequests(status: AccessRequest["status"] = "open", limit = 50): Promise<AccessRequest[]> {
  return (await col()).find({ status }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function openRequestFor(userId: string, itemKey: string, label: string): Promise<AccessRequest | null> {
  return (await col()).findOne({ userId, itemKey, label, status: "open" });
}

export async function getAccessRequest(id: string): Promise<AccessRequest | null> {
  return (await col()).findOne({ _id: id });
}

/** A Director marks a request handled (access given on the person's edit page) or dismissed; the person is told. */
export async function resolveAccessRequest(id: string, status: "granted" | "dismissed", actorId: string): Promise<{ ok: boolean }> {
  const c = await col();
  const r = await c.findOneAndUpdate({ _id: id, status: "open" }, { $set: { status, resolvedAt: new Date(), resolvedBy: actorId } }, { returnDocument: "after" });
  if (!r) return { ok: false };
  try {
    await notifyUsers("workspace", [r.userId], { type: "workspace_event", title: status === "granted" ? `You now have access to ${r.label}` : `Your request for ${r.label} was not approved`, body: status === "granted" ? "Open the item again from your sidebar." : "Ask a Director if you need to know why.", link: "/commandos", dedupeKey: `access-request-done:${id}` });
  } catch {
    /* the list is the record */
  }
  return { ok: true };
}
