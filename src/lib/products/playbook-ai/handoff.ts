import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { playbookCan } from "@/lib/playbook-roles";
import { getCatalogueMeta } from "@/lib/products/playbook-ai/catalogue/registry";
import { getDocument, getDocumentVersion, saveVersion } from "@/lib/products/playbook-ai/documents";
import type { PbActor, PbVersionRecord } from "@/lib/products/playbook-ai/documents-types";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { buildMissingReport } from "@/lib/products/playbook-ai/variables-registry";
import { buildVariableSnapshot, loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import type { ItemKind } from "@/lib/products/playbook-ai/items-types";
import { collectVariables } from "@/lib/products/playbook-ai/doc/variables";
import { createCloneFromItem, createCloneFromPlaybook, type CloneInput } from "@/lib/products/contractflow-ai/clones";
import { MANDATORY_NOTICE } from "@/lib/products/contractflow-ai/sign-consent";
import { createManualParty, linkParty } from "@/lib/products/contractflow-ai/parties";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";
import { isLinkedType, isPartyType } from "@/lib/products/contractflow-ai/party-types";
import type { HandoffRecord, SendContext, SendIssue } from "@/lib/products/playbook-ai/handoff-types";

/**
 * "Send for signature" from Playbook (H1). Playbook decides WHETHER a version may be sent (permission, status, template flags, filled
 * placeholders, lawyer-review confirmation); ContractFlow does the copying (`createCloneFromPlaybook`) and keeps the clone. Nothing here
 * writes to the document, its versions or its templates: the only Playbook writes are the `pb_handoffs` row and an audit entry.
 */

const col = async () => (await getDb()).collection<HandoffRecord>(PB_COLLECTIONS.handoffs);
const ctxOf = (a: PbActor) => ({ roles: a.roles, permissionOverrides: a.permissionOverrides ?? undefined });

/** The ContractFlow-side viewer for a Playbook user who holds SEND_FOR_SIGNATURE (lets them pick or add the other party). */
export function senderViewer(actor: PbActor): LpmsViewer {
  return { userId: actor.id, email: actor.email ?? "", roles: [...actor.roles], overrides: (actor.permissionOverrides ?? {}) as Record<string, boolean>, lpmsRoles: [], employeeId: null, companyId: "", sendForSignature: true };
}

/** Whether (and why not) a document's version can be sent. All problems are listed, not just the first. */
export async function getSendContext(actor: PbActor, documentId: string, versionNumber?: number): Promise<{ ok: true; context: SendContext; version: PbVersionRecord | null } | { ok: false; message: string }> {
  const rec = await getDocument(actor, String(documentId));
  if (!rec.ok) return { ok: false, message: rec.error.message };
  const d = rec.document;
  const issues: SendIssue[] = [];
  const meta = d.docTypeId ? getCatalogueMeta(d.docTypeId) : null;
  if (!playbookCan(ctxOf(actor), "SEND_FOR_SIGNATURE")) issues.push({ code: "permission", message: "You do not have the right to send documents for signature." });
  if (d.status !== "approved" && d.status !== "issued") issues.push({ code: "status", message: `Only an approved or issued document can be sent. This one is ${d.status.replace("_", " ")}.` });

  const number = versionNumber ?? d.issuedVersion ?? d.latestVersion ?? null;
  let version: PbVersionRecord | null = null;
  if (number === null) issues.push({ code: "no_version", message: "This document has no saved version to send. Approve or issue it first." });
  else {
    const v = await getDocumentVersion(actor, d._id, number);
    if (!v.ok) issues.push({ code: "no_version", message: "That version does not exist." });
    else {
      version = v.version;
      if (version.status !== "approved" && version.status !== "issued") issues.push({ code: "status", message: `Version ${version.number} was saved as ${version.status.replace("_", " ")}; only an approved or issued version can be sent.` });
      if (!version.variableSnapshot) issues.push({ code: "no_snapshot", message: `Version ${version.number} has no frozen values (it was not approved or issued), so it cannot be sent.` });
      else {
        const used = collectVariables(version.pbdoc);
        if (used.placeholders.length > 0) issues.push({ code: "placeholders", message: `The document still has ${used.placeholders.length} unfilled placeholder${used.placeholders.length === 1 ? "" : "s"}: ${used.placeholders.slice(0, 5).map((p) => p.label || p.key).join(", ")}. Fill them in Playbook and approve again.` });
        const report = buildMissingReport({ doc: version.pbdoc, values: version.variableSnapshot.values, lists: version.variableSnapshot.lists, links: d.links });
        if (report.missing.length > 0) issues.push({ code: "missing_values", message: `Some values the document needs are missing: ${report.missing.slice(0, 5).map((m) => m.label).join(", ")}.` });
      }
    }
  }
  if (meta) {
    if (meta.esignIneligible) issues.push({ code: "not_esignable", message: `${meta.name} is not suitable for a simple electronic signature (it needs a wet signature, registration or a stronger signature). It cannot be sent for e-signing. Ask a lawyer how to execute it.` });
    else if (meta.sign === "no") issues.push({ code: "not_esignable", message: `${meta.name} is not a document that is signed, so it cannot be sent for signature.` });
    if (meta.legal.review && !d.legalAck) issues.push({ code: "legal_ack", message: "This is a legal document type. Its issue must first record the confirmation that a qualified lawyer has reviewed it. Issue it with that confirmation, then send it." });
  }
  return {
    ok: true,
    version,
    context: {
      documentId: d._id,
      title: d.title,
      versionNumber: version?.number ?? number,
      docTypeName: meta?.name ?? null,
      eligible: issues.length === 0,
      issues,
      stampRule: meta?.stamp.rule ?? null,
      stampCategory: meta?.stamp.category ?? null,
      legalReview: meta?.legal.review ?? false,
      defaultPartyType: meta && meta.party !== "none" ? meta.party : null,
      notice: MANDATORY_NOTICE,
    },
  };
}

export interface SendInput {
  documentId: string;
  versionNumber?: number;
  party: { type: string; recordId?: string | null; partyId?: string | null; displayName?: string; email?: string; phone?: string };
  signers: CloneInput["signers"];
  expiryDays: number;
  reminderDays: number[];
  orderMode: "parallel" | "sequential";
  dates?: CloneInput["dates"];
  placeOfExecution?: string | null;
  /** The sender wants the stamping step even though the template does not require it. */
  stampRequested?: boolean;
}

export type SendResult = { ok: true; handoff: HandoffRecord; cloneId: string } | { ok: false; message: string; issues?: SendIssue[] };

export async function sendForSignature(actor: PbActor, input: SendInput): Promise<SendResult> {
  const ctx = await getSendContext(actor, input.documentId, input.versionNumber);
  if (!ctx.ok) return { ok: false, message: ctx.message };
  if (!ctx.context.eligible || !ctx.version) return { ok: false, message: ctx.context.issues[0]?.message ?? "This document cannot be sent.", issues: ctx.context.issues };
  const version = ctx.version;
  if (!isPartyType(input.party?.type)) return { ok: false, message: "Choose the kind of party this is for." };

  const viewer = senderViewer(actor);
  let partyId: string | null = null;
  let displayName = String(input.party.displayName ?? "");
  try {
    if (input.party.partyId) partyId = String(input.party.partyId);
    else if (isLinkedType(input.party.type)) {
      const linked = await linkParty(viewer, { type: input.party.type, recordId: String(input.party.recordId ?? "") });
      partyId = linked.id;
      displayName = linked.displayName;
    } else {
      const made = await createManualParty(viewer, { type: input.party.type, name: displayName, email: input.party.email, phone: input.party.phone });
      partyId = made.id;
      displayName = made.displayName;
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The party could not be set up." };
  }

  const stampRequired = ctx.context.stampRule === "likely" || input.stampRequested === true;
  const created = await createCloneFromPlaybook(actor, {
    documentId: input.documentId,
    versionId: version._id,
    party: { type: input.party.type, partyId, displayName },
    signers: input.signers,
    dates: input.dates,
    stamp: { required: stampRequired, state: input.placeOfExecution ?? null, instrumentCategory: ctx.context.stampCategory },
    options: { expiryDays: input.expiryDays, reminderDays: input.reminderDays, orderMode: input.orderMode, placeOfExecution: input.placeOfExecution ?? null },
  });
  if (!created.ok) return { ok: false, message: created.error.message };
  const clone = created.clone;
  const now = new Date();
  const handoff: HandoffRecord = {
    _id: randomUUID(),
    documentId: input.documentId,
    versionId: version._id,
    versionNumber: version.number,
    cloneId: clone._id,
    partyType: input.party.type,
    partyName: clone.party.displayName,
    sentBy: actor.id,
    sentByName: actor.name,
    sentAt: now,
    status: "clone_draft",
    statusAt: now,
    statusLog: [{ status: "clone_draft", at: now, note: "Copied to ContractFlow" }],
    signers: clone.signerPlan.map((s) => ({ name: s.name, role: s.role, order: s.order ?? 0, status: "pending", at: null })),
    sealed: null,
  };
  await (await col()).insertOne(handoff);
  await recordPbAudit({ actor, action: "send_for_signature", entity: "version", entityId: version._id, documentId: input.documentId, summary: `Sent version ${version.number} to ContractFlow for signature (${clone.party.displayName})`, metadata: { cloneId: clone._id, versionNumber: version.number } });
  return { ok: true, handoff, cloneId: clone._id };
}

/** The sends of one document, newest first (the actor must be able to open the document). */
export async function listHandoffs(actor: PbActor, documentId: string): Promise<HandoffRecord[]> {
  const rec = await getDocument(actor, String(documentId));
  if (!rec.ok) return [];
  return (await col()).find({ documentId }).sort({ sentAt: -1 }).limit(100).toArray();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// "Send to ContractFlow" for SOPs, documents and KPI sheets (the simple flow)
// ---------------------------------------------------------------------------------------------------------------------------------

export interface SendItemInput {
  documentId: string;
  party: { type: string; recordId?: string | null; partyId?: string | null; displayName?: string; email?: string; phone?: string };
  /** Optional: signers can also be added in ContractFlow before it is sent. */
  signers?: CloneInput["signers"];
}

/**
 * Copies the item's current content to ContractFlow as a draft clone. Nothing is ever sent to a signer from here. The draft is first saved
 * as a Playbook version (so the copy is traceable), the variable values are frozen into the clone, and the party is linked (employee,
 * client, vendor...) or created as a manual party. Playbook's item is not changed apart from the new version and the handoff row.
 */
export async function sendItemToContractFlow(actor: PbActor, input: SendItemInput): Promise<SendResult> {
  if (!playbookCan(ctxOf(actor), "SEND_FOR_SIGNATURE")) return { ok: false, message: "You do not have the right to send documents to ContractFlow." };
  const rec = await getDocument(actor, String(input.documentId));
  if (!rec.ok) return { ok: false, message: rec.error.message };
  const d = rec.document;
  if (!isPartyType(input.party?.type)) return { ok: false, message: "Choose who this is for." };

  let versionNumber: number | null = d.issuedVersion ?? d.latestVersion;
  if (d.status === "draft") {
    const saved = await saveVersion(actor, { id: d._id, label: "Sent to ContractFlow", kind: "manual" });
    if (!saved.ok) return { ok: false, message: saved.error.message };
    versionNumber = saved.version.number;
  }
  if (versionNumber === null) return { ok: false, message: "This item has no saved content to send." };
  const got = await getDocumentVersion(actor, d._id, versionNumber);
  if (!got.ok) return { ok: false, message: got.error.message };
  const version = got.version;

  const loaded = await loadVariableValues(actor, { doc: { title: d.title, docNumber: d.docNumber, version: version.number, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy }, links: d.links, inputs: d.inputs });
  const snapshot = buildVariableSnapshot(version.pbdoc, loaded, d.lists);

  const viewer = senderViewer(actor);
  let partyId: string | null = null;
  let displayName = String(input.party.displayName ?? "");
  try {
    if (input.party.partyId) partyId = String(input.party.partyId);
    else if (isLinkedType(input.party.type)) {
      const linked = await linkParty(viewer, { type: input.party.type, recordId: String(input.party.recordId ?? "") });
      partyId = linked.id;
      displayName = linked.displayName;
    } else {
      const made = await createManualParty(viewer, { type: input.party.type, name: displayName, email: input.party.email, phone: input.party.phone });
      partyId = made.id;
      displayName = made.displayName;
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The party could not be set up." };
  }

  const created = await createCloneFromItem(actor, {
    version, snapshot, kind: (d.kind ?? "document") as ItemKind, meta: d.meta ?? {}, docTypeId: d.docTypeId,
    title: d.title,
    party: { type: input.party.type, partyId, displayName },
    signers: input.signers ?? [],
    stamp: { required: false, state: null, instrumentCategory: null },
    options: { expiryDays: 14, reminderDays: [3], orderMode: "parallel", placeOfExecution: null },
  });
  if (!created.ok) return { ok: false, message: created.error.message };
  const clone = created.clone;
  const now = new Date();
  const handoff: HandoffRecord = {
    _id: randomUUID(), documentId: d._id, versionId: version._id, versionNumber: version.number, cloneId: clone._id,
    partyType: input.party.type, partyName: clone.party.displayName, sentBy: actor.id, sentByName: actor.name, sentAt: now,
    status: "clone_draft", statusAt: now, statusLog: [{ status: "clone_draft", at: now, note: "Copied to ContractFlow" }],
    signers: clone.signerPlan.map((s) => ({ name: s.name, role: s.role, order: s.order ?? 0, status: "pending", at: null })), sealed: null,
  };
  await (await col()).insertOne(handoff);
  await recordPbAudit({ actor, action: "send_for_signature", entity: "version", entityId: version._id, documentId: d._id, summary: `Copied "${d.title}" to ContractFlow for ${clone.party.displayName}`, metadata: { cloneId: clone._id, versionNumber: version.number } });
  return { ok: true, handoff, cloneId: clone._id };
}

/** Handoff rows of several documents at once (for the lists). The caller has already limited the ids to items the actor may open. */
export async function listHandoffsForDocuments(documentIds: string[]): Promise<Map<string, HandoffRecord[]>> {
  const out = new Map<string, HandoffRecord[]>();
  if (documentIds.length === 0) return out;
  const rows = await (await col()).find({ documentId: { $in: documentIds.slice(0, 200) } }).sort({ sentAt: -1 }).limit(1000).toArray();
  for (const r of rows) out.set(r.documentId, [...(out.get(r.documentId) ?? []), r]);
  return out;
}
