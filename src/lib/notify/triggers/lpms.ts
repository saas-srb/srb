import "server-only";
import { ObjectId } from "mongodb";
import { getLpmsDocumentsCollection } from "@/lib/products/contractflow-ai/db";
import { notifyRoles, notifyUsers } from "@/lib/notify";
import { day, plural, short, today } from "@/lib/notify/triggers/format";

/**
 * Legal & process notifications. Decisions go to the people who can make them (LPMS admins and managers); outcomes go back to the
 * document's own owner and author. Whoever made the change is not told about it.
 */
const APPROVERS = ["lpms_admin", "lpms_manager"];
const link = (id: string) => `/contractflow-ai/documents/${id}`;

interface Doc { id: string; title: string; number?: string; owners: string[] }

async function load(id: string): Promise<Doc | null> {
  try {
    const d = (await (await getLpmsDocumentsCollection()).findOne({ _id: new ObjectId(id) as never })) as unknown as { title?: string; documentNumber?: string; ownerId?: string; createdBy?: string } | null;
    if (!d) return null;
    return { id, title: d.title ?? "Document", number: d.documentNumber, owners: [...new Set([d.ownerId, d.createdBy].filter((x): x is string => !!x))] };
  } catch {
    return null;
  }
}
const name = (d: Doc) => `${d.number ? `${d.number} · ` : ""}${short(d.title, 70)}`;

export const lpmsEvents = {
  submittedForReview: async (id: string, actor: string) => {
    const d = await load(id);
    if (d) await notifyRoles("lpms", APPROVERS, { type: "lpms_review_requested", title: `Review requested: ${short(d.title, 60)}`, body: name(d), link: link(id), dedupeKey: `lpms-review:${id}:${today()}` }, actor);
  },
  submittedForApproval: async (id: string, actor: string) => {
    const d = await load(id);
    if (d) await notifyRoles("lpms", APPROVERS, { type: "lpms_approval_needed", title: `Approval needed: ${short(d.title, 60)}`, body: name(d), link: link(id), priority: "high", dedupeKey: `lpms-approval:${id}:${today()}` }, actor);
  },
  decided: async (id: string, decision: "approved" | "rejected", notes: string, actor: string) => {
    const d = await load(id);
    if (!d) return;
    await notifyUsers("lpms", d.owners.filter((o) => o !== actor), { type: `lpms_${decision}`, title: `Document ${decision}: ${short(d.title, 60)}`, body: notes ? `Note: ${short(notes, 160)}` : name(d), link: link(id), priority: decision === "rejected" ? "high" : "normal" });
  },
  published: async (id: string, actor: string) => {
    const d = await load(id);
    if (!d) return;
    await notifyUsers("lpms", d.owners.filter((o) => o !== actor), { type: "lpms_published", title: `Published: ${short(d.title, 60)}`, body: name(d), link: link(id) });
    await notifyRoles("lpms", APPROVERS, { type: "lpms_published", title: `Published: ${short(d.title, 60)}`, body: name(d), link: link(id) }, actor);
  },
  stateChanged: async (id: string, what: "activated" | "archived", actor: string) => {
    const d = await load(id);
    if (d) await notifyUsers("lpms", d.owners.filter((o) => o !== actor), { type: `lpms_${what}`, title: `Document ${what}: ${short(d.title, 60)}`, body: name(d), link: link(id) });
  },
  signaturesRequested: async (id: string, signers: number, actor: string) => {
    const d = await load(id);
    if (d) await notifyUsers("lpms", d.owners.filter((o) => o !== actor), { type: "lpms_signature_requested", title: `Signatures requested: ${short(d.title, 60)}`, body: `Waiting on ${plural(signers, "signer")}.`, link: link(id) });
  },
  signatureUpdate: async (documentId: string, signerEmail: string, status: "signed" | "declined" | "expired", overall: "completed" | "declined" | null) => {
    const d = await load(documentId);
    if (!d) return;
    const title = overall === "completed" ? `Fully signed: ${short(d.title, 60)}` : status === "signed" ? `Signed by ${signerEmail}` : status === "declined" ? `Declined by ${signerEmail}` : `Signature expired for ${signerEmail}`;
    await notifyUsers("lpms", d.owners, { type: `lpms_signature_${overall ?? status}`, title, body: name(d), link: link(id(d)), priority: status === "signed" && !overall ? "normal" : "high" });
  },
  /** Daily: documents whose expiry date is within 30 days (or past). One notice per document per threshold. */
  expiryDigest: async () => {
    const col = await getLpmsDocumentsCollection();
    const soon = new Date(Date.now() + 30 * 86_400_000);
    const rows = (await col.find({ status: { $in: ["active", "published", "approved"] }, expiryDate: { $ne: null, $lte: soon } } as never).limit(100).toArray()) as unknown as { _id: ObjectId; title?: string; documentNumber?: string; expiryDate: Date | string; ownerId?: string; createdBy?: string }[];
    for (const r of rows) {
      const exp = new Date(r.expiryDate);
      if (Number.isNaN(exp.getTime())) continue;
      const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
      const bucket = days < 0 ? "expired" : days <= 7 ? "7d" : "30d";
      const idStr = String(r._id);
      const owners = [...new Set([r.ownerId, r.createdBy].filter((x): x is string => !!x))];
      await notifyUsers("lpms", owners, { type: days < 0 ? "lpms_expired" : "lpms_expiring", title: days < 0 ? `Expired: ${short(r.title, 60)}` : `Expires in ${plural(days, "day")}: ${short(r.title, 60)}`, body: `${r.documentNumber ?? ""} · ${day(exp)}`.replace(/^ · /, ""), link: link(idStr), priority: days <= 7 ? "high" : "normal", dedupeKey: `lpms-exp:${idStr}:${bucket}` });
    }
  },
};
const id = (d: Doc) => d.id;
