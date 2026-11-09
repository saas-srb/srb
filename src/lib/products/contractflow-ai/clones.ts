import "server-only";
import { randomUUID } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { playbookCan } from "@/lib/playbook-roles";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { getDocumentVersion } from "@/lib/products/playbook-ai/documents";
import type { PbActor, PbVersionRecord, VariableSnapshot } from "@/lib/products/playbook-ai/documents-types";
import type { ItemKind, ItemMeta } from "@/lib/products/playbook-ai/items-types";
import { diffDocs, summarizeDiff, type DocDiff } from "@/lib/products/playbook-ai/diff";
import { contentHash } from "@/lib/products/playbook-ai/doc/hash";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { cfCloneEdits, cfCloneVersions, cfClones, cfParties, cfRequests, cfSigners } from "./cf-db";
import { canAccessPartyType } from "./parties";
import { markVersionStatus, recordVersion } from "./clone-versions";
import { closeRequest } from "./requests";
import { SIGNER_ROLES } from "./sign-types";
import { isPartyType } from "./party-types";
import { EDITABLE_CLONE_STATUSES, type CloneOptions, type CloneDates, type CloneDoc, type CloneEditDoc, type CloneParty, type CloneResult, type CloneStamp, type CloneSummary, type VersionSource, type EditDiffEntry, type EditKind } from "./clone-types";
import type { NewSigner } from "./requests-types";
import type { LpmsViewer } from "./types";

/**
 * The clone store (B1): a Playbook document copied into ContractFlow to be signed.
 *
 *  - The Playbook document, its versions and its templates are NEVER written to from here. The only Playbook access is a read.
 *  - A clone is editable (same editor, same PBDoc) until the first signature exists. The lock is enforced HERE, in the update filter of
 *    every content write (`lockedAt: null`, status editable, matching `rev`), not only in the screens. Signing code must call
 *    `markSignatureApplied` in the same step that records a signature; as a second line of defence a save also looks for a signed signer
 *    on the clone's requests and refuses (and locks) if it finds one.
 *  - After a signature, change = void (reason required, links revoked, evidence kept) and a NEW clone, linked both ways.
 *  - Every content change and state change appends a row to `cf_clone_edits` (with a block-level diff for content), and nothing there is ever
 *    updated or deleted.
 */

const ctx = (v: LpmsViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });
const fail = (code: import("./clone-types").CloneErrorCode, message: string, extra: { currentRev?: number } = {}): { ok: false; error: import("./clone-types").CloneError } => ({ ok: false, error: { code, message, ...extra } });
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIFF_CAP = 100;
const TEXT_CAP = 1000;

// ── Access ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function canViewClone(v: LpmsViewer, c: Pick<CloneDoc, "party">): boolean {
  return lpmsCan(ctx(v), "VIEW") && (!c.party.partyId || canAccessPartyType(v, c.party.type));
}
const canEditClone = (v: LpmsViewer) => lpmsCan(ctx(v), "EDIT");
const canManageClone = (v: LpmsViewer) => lpmsCan(ctx(v), "SIGN") || lpmsCan(ctx(v), "MANAGE_DOCUMENTS");

export const isCloneLocked = (c: Pick<CloneDoc, "lockedAt" | "signatureCount" | "status">) =>
  c.lockedAt !== null || c.signatureCount > 0 || c.status === "partially_signed" || c.status === "signed";

/** What the screens may offer this person for this clone. The data layer re-checks everything. */
export function cloneCapabilities(v: LpmsViewer, c: CloneDoc | CloneSummary) {
  const locked = isCloneLocked(c);
  return {
    view: canViewClone(v, c),
    edit: canEditClone(v) && !locked && (EDITABLE_CLONE_STATUSES as readonly string[]).includes(c.status),
    locked,
    void: canManageClone(v) && c.status !== "voided" && c.status !== "signed",
    reclone: canManageClone(v) && c.status === "voided" && !c.replacedBy,
    markReady: canManageClone(v) && c.status === "clone_draft",
    send: canManageClone(v) && c.status === "ready",
    download: lpmsCan(ctx(v), "DOWNLOAD"),
  };
}

// ── Audit ──────────────────────────────────────────────────────────────────────────────────────────────────────
function diffEntries(d: DocDiff): EditDiffEntry[] {
  return d.entries
    .filter((e) => e.kind !== "unchanged")
    .slice(0, DIFF_CAP)
    .map((e) => ({ id: e.id, zone: e.zone, blockType: e.blockType, kind: e.kind, before: e.before?.slice(0, TEXT_CAP) ?? null, after: e.after?.slice(0, TEXT_CAP) ?? null }));
}

async function audit(cloneId: string, kind: EditKind, rev: number, by: string | null, summary: string, extra: Partial<Pick<CloneEditDoc, "detail" | "diff" | "beforeSha256" | "afterSha256">> = {}): Promise<void> {
  await (await cfCloneEdits()).insertOne({ _id: randomUUID(), cloneId, kind, rev, at: new Date(), by, summary, detail: extra.detail ?? {}, diff: extra.diff ?? null, beforeSha256: extra.beforeSha256 ?? null, afterSha256: extra.afterSha256 ?? null });
}

export async function listCloneEdits(v: LpmsViewer, cloneId: string): Promise<CloneResult<{ edits: CloneEditDoc[] }>> {
  const c = await loadClone(v, cloneId);
  if (!c.ok) return c;
  return { ok: true, edits: await (await cfCloneEdits()).find({ cloneId }).sort({ at: 1, _id: 1 }).toArray() };
}

// ── Loading ────────────────────────────────────────────────────────────────────────────────────────────────────
async function loadClone(v: LpmsViewer, id: string): Promise<CloneResult<{ clone: CloneDoc }>> {
  const clone = typeof id === "string" && id.length <= 64 ? await (await cfClones()).findOne({ _id: id }) : null;
  if (!clone) return fail("not_found", "That document was not found.");
  if (!canViewClone(v, clone)) return fail("forbidden", "You do not have access to this document.");
  return { ok: true, clone };
}

export const editedAfterCloning = (c: Pick<CloneDoc, "contentSha256" | "source">) => c.contentSha256 !== c.source.sourceContentSha256;

export async function getClone(v: LpmsViewer, id: string): Promise<CloneResult<{ clone: CloneDoc; edited: boolean; capabilities: ReturnType<typeof cloneCapabilities> }>> {
  const r = await loadClone(v, id);
  if (!r.ok) return r;
  return { ok: true, clone: r.clone, edited: editedAfterCloning(r.clone), capabilities: cloneCapabilities(v, r.clone) };
}

export async function listClones(v: LpmsViewer, opts: { status?: string; kind?: ItemKind; limit?: number } = {}): Promise<CloneSummary[]> {
  if (!lpmsCan(ctx(v), "VIEW")) return [];
  const filter: Record<string, unknown> = { deletedAt: null };
  if (opts.status) filter.status = opts.status;
  if (opts.kind) filter.kind = opts.kind === "document" ? { $in: ["document", null] } : opts.kind;
  const rows = await (await cfClones())
    .find(filter as never, { projection: { pbdoc: 0, variableSnapshot: 0 } })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500))
    .toArray();
  return (rows as unknown as Omit<CloneSummary, "editedAfterCloning">[]).filter((c) => canViewClone(v, c)).map((c) => ({ ...c, editedAfterCloning: editedAfterCloning(c) }));
}

// ── Creating ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface CloneInput {
  title?: string;
  party: { type: string; partyId?: string | null; displayName?: string };
  signers: NewSigner[];
  dates?: Partial<CloneDates>;
  stamp?: Partial<CloneStamp>;
  options?: Partial<CloneOptions>;
}

async function resolveParty(p: CloneInput["party"]): Promise<CloneResult<{ party: CloneParty }>> {
  if (!isPartyType(p?.type)) return fail("invalid", "Choose the kind of party this document is for.");
  if (p.partyId) {
    const row = await (await cfParties()).findOne({ _id: String(p.partyId).slice(0, 64) });
    if (!row || row.status === "archived") return fail("invalid", "That party was not found.");
    if (row.type !== p.type) return fail("invalid", "That party is not of the chosen kind.");
    return { ok: true, party: { type: row.type, partyId: row._id, displayName: row.displayName } };
  }
  const name = clean(p.displayName, 160);
  if (name.length < 2) return fail("invalid", "Enter the party's name.");
  return { ok: true, party: { type: p.type, partyId: null, displayName: name } };
}

function checkSigners(signers: unknown): CloneResult<{ signers: NewSigner[] }> {
  if (!Array.isArray(signers) || signers.length < 1 || signers.length > 20) return fail("invalid", "Add between 1 and 20 signers.");
  const seen = new Set<string>();
  const out: NewSigner[] = [];
  for (const [i, s] of (signers as NewSigner[]).entries()) {
    const email = clean(s?.email, 200).toLowerCase();
    const name = clean(s?.name, 160);
    if (!SIGNER_ROLES.includes(s?.role)) return fail("invalid", "A signer's role is not valid.");
    if (name.length < 2) return fail("invalid", "Every signer needs a name.");
    if (!EMAIL.test(email)) return fail("invalid", `The email address for ${name} is not valid.`);
    if (seen.has(email)) return fail("invalid", `${email} is listed twice.`);
    seen.add(email);
    out.push({ role: s.role, name, email, phone: clean(s.phone, 30) || undefined, order: Number.isInteger(s.order) && (s.order as number) >= 1 ? s.order : i + 1 });
  }
  return { ok: true, signers: out };
}

const isoOrNull = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);

interface CloneSourceContent {
  version: Pick<PbVersionRecord, "_id" | "documentId" | "number" | "pbdoc" | "contentSha256" | "variableSnapshot" | "docNumber" | "templateRef" | "title" | "status">;
  docTypeId: string | null;
}

async function insertClone(v: { id: string }, src: CloneSourceContent, pbdoc: PBDoc, input: CloneInput, extra: { replaces?: string | null; allowNoSigners?: boolean; kind?: ItemKind; meta?: ItemMeta } = {}): Promise<CloneResult<{ clone: CloneDoc }>> {
  const party = await resolveParty(input.party);
  if (!party.ok) return party;
  const signers: CloneResult<{ signers: NewSigner[] }> = extra.allowNoSigners && (!Array.isArray(input.signers) || input.signers.length === 0) ? { ok: true, signers: [] } : checkSigners(input.signers);
  if (!signers.ok) return signers;
  const snapshot = src.version.variableSnapshot;
  if (!snapshot) return fail("source_unavailable", "That version has no frozen variable values, so it cannot be sent for signature. Approve or issue it first.");
  const now = new Date();
  const parsed = parseDoc(pbdoc, { assignIds: false });
  if (!parsed.ok) return fail("invalid", "The document is not valid.");
  const clone: CloneDoc = {
    _id: randomUUID(),
    title: clean(input.title, 200) || src.version.title,
    kind: extra.kind ?? "document",
    meta: extra.meta ?? {},
    deletedAt: null,
    status: "clone_draft",
    pbdoc: structuredClone(parsed.doc),
    contentSha256: contentHash(parsed.doc),
    rev: 1,
    source: { product: "playbook-ai", documentId: src.version.documentId, versionId: src.version._id, versionNumber: src.version.number, docNumber: src.version.docNumber, docTypeId: src.docTypeId, templateRef: src.version.templateRef, sourceContentSha256: src.version.contentSha256 },
    variableSnapshot: structuredClone(snapshot),
    party: party.party,
    signerPlan: signers.signers,
    dates: { effectiveDate: isoOrNull(input.dates?.effectiveDate), expiryDate: isoOrNull(input.dates?.expiryDate), renewalDate: isoOrNull(input.dates?.renewalDate), autoRenew: input.dates?.autoRenew === true, noticePeriodDays: Number.isInteger(input.dates?.noticePeriodDays) && (input.dates!.noticePeriodDays as number) >= 0 ? (input.dates!.noticePeriodDays as number) : null },
    stamp: { required: input.stamp?.required === true, state: clean(input.stamp?.state, 4) || null, instrumentCategory: clean(input.stamp?.instrumentCategory, 41) || null },
    options: {
      expiryDays: Number.isInteger(input.options?.expiryDays) && (input.options!.expiryDays as number) >= 1 && (input.options!.expiryDays as number) <= 365 ? (input.options!.expiryDays as number) : 14,
      reminderDays: Array.isArray(input.options?.reminderDays) ? [...new Set((input.options!.reminderDays as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 60))].sort((a, b) => b - a).slice(0, 5) : [],
      orderMode: input.options?.orderMode === "sequential" ? "sequential" : "parallel",
      placeOfExecution: clean(input.options?.placeOfExecution, 4) || null,
    },
    requestId: null,
    signatureCount: 0,
    lockedAt: null,
    frozenContentSha256: null,
    replaces: extra.replaces ?? null,
    replacedBy: null,
    voidReason: null,
    voidedAt: null,
    createdBy: v.id,
    createdAt: now,
    updatedAt: now,
    lastEditorId: null,
  };
  await (await cfClones()).insertOne(clone);
  await recordVersion(clone, 1, { id: v.id, name: null }, extra.replaces ? "Created as a replacement for a voided document" : `Copied from Playbook version ${src.version.number}`, "created");
  await audit(clone._id, extra.replaces ? "recloned_to" : "created", 1, v.id, extra.replaces ? "Created as a replacement for a voided document" : `Cloned from Playbook version ${src.version.number}`, { detail: { sourceDocumentId: src.version.documentId, sourceVersionId: src.version._id, replaces: extra.replaces ?? null }, afterSha256: clone.contentSha256 });
  return { ok: true, clone };
}

/** Verifies a version's content against its stored hash, so a damaged source is never cloned. */
function verifiedSource(v: PbVersionRecord): CloneResult<{ pbdoc: PBDoc }> {
  const parsed = parseDoc(v.pbdoc, { assignIds: false });
  if (!parsed.ok || contentHash(parsed.doc) !== v.contentSha256) return fail("source_unavailable", "The Playbook version does not match its recorded fingerprint, so it was not copied.");
  return { ok: true, pbdoc: parsed.doc };
}

export interface CreateCloneFromPlaybookInput extends CloneInput {
  documentId: string;
  /** The version's id (`pb_versions._id`). */
  versionId: string;
}

/**
 * "Send for signature", the ContractFlow side (called by the Playbook dialog, H1). The caller is a Playbook user: it must hold
 * SEND_FOR_SIGNATURE and can read the document (the Playbook data layer's own access check runs). Copies the chosen version's PBDoc and its
 * frozen variable snapshot; sending the same version twice makes a second, independent clone.
 */
export async function createCloneFromPlaybook(actor: PbActor, input: CreateCloneFromPlaybookInput): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!playbookCan({ roles: actor.roles, permissionOverrides: actor.permissionOverrides ?? undefined }, "SEND_FOR_SIGNATURE")) return fail("forbidden", "You may not send documents for signature.");
  const documentId = clean(input.documentId, 64);
  const versionId = clean(input.versionId, 64);
  const row = documentId && versionId ? await (await getDb()).collection<{ _id: string; documentId: string; number: number }>(PB_COLLECTIONS.versions).findOne({ _id: versionId, documentId }, { projection: { number: 1, documentId: 1 } }) : null;
  if (!row) return fail("not_found", "That Playbook version was not found.");
  const got = await getDocumentVersion(actor, documentId, row.number); // Playbook's own access check
  if (!got.ok) return fail(got.error.code === "forbidden" ? "forbidden" : "not_found", got.error.message);
  const version = got.version;
  if (version.status !== "approved" && version.status !== "issued") return fail("bad_status", "Only an approved or issued version can be sent for signature.");
  const ok = verifiedSource(version);
  if (!ok.ok) return ok;
  const docRow = await (await getDb()).collection<{ _id: string; docTypeId: string | null }>(PB_COLLECTIONS.documents).findOne({ _id: documentId }, { projection: { docTypeId: 1 } });
  return insertClone({ id: actor.id }, { version, docTypeId: docRow?.docTypeId ?? null }, ok.pbdoc, input);
}

export interface CreateCloneFromItemInput extends CloneInput {
  version: PbVersionRecord;
  snapshot: VariableSnapshot;
  kind: ItemKind;
  meta: ItemMeta;
  docTypeId: string | null;
}

/**
 * "Send to ContractFlow" for SOPs, documents and KPI sheets (the simple flow). The caller has already frozen the Playbook version and the
 * variable values. Nothing is sent to anyone: this only creates the draft clone, which is prepared and sent from ContractFlow. Signers are
 * optional here and required when the clone is sent.
 */
export async function createCloneFromItem(actor: PbActor, input: CreateCloneFromItemInput): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!playbookCan({ roles: actor.roles, permissionOverrides: actor.permissionOverrides ?? undefined }, "SEND_FOR_SIGNATURE")) return fail("forbidden", "You may not send documents to ContractFlow.");
  const ok = verifiedSource(input.version);
  if (!ok.ok) return ok;
  return insertClone({ id: actor.id }, { version: { ...input.version, variableSnapshot: input.snapshot }, docTypeId: input.docTypeId }, ok.pbdoc, input, { allowNoSigners: true, kind: input.kind, meta: input.meta });
}

/** Reads the Playbook version a clone came from (read only). Null when it no longer exists. */
async function readSourceVersion(c: Pick<CloneDoc, "source">): Promise<PbVersionRecord | null> {
  return (await getDb()).collection<PbVersionRecord>(PB_COLLECTIONS.versions).findOne({ _id: c.source.versionId, documentId: c.source.documentId });
}

// ── Editing (the editor's store) ──────────────────────────────────────────────────────────────────────────────
export async function saveCloneContent(v: LpmsViewer, input: { id: string; doc: unknown; baseRev: number; source?: VersionSource; note?: string }): Promise<CloneResult<{ rev: number; savedAt: string; unchanged: boolean; contentSha256: string }>> {
  if (!canEditClone(v)) return fail("forbidden", "You may not edit documents.");
  const l = await loadClone(v, input.id);
  if (!l.ok) return l;
  const prev = l.clone;
  const parsed = parseDoc(input.doc, { assignIds: true });
  if (!parsed.ok) return fail("invalid", `The document is not valid: ${parsed.issues[0]?.message ?? "fix the problem shown in the editor"}.`);
  if (!Number.isInteger(input.baseRev) || input.baseRev < 1) return fail("invalid", "The document version is not valid. Reload the page.");
  if (await lockedBySignature(prev)) return fail("locked", "A signature has been applied, so this document can no longer be edited. Void it and create a new one to make changes.");
  if (!(EDITABLE_CLONE_STATUSES as readonly string[]).includes(prev.status)) return fail("bad_status", `This document is ${prev.status.replace("_", " ")} and cannot be edited.`);
  if (prev.rev !== input.baseRev) return fail("conflict", "Someone else changed this document. Reload to see their changes.", { currentRev: prev.rev });

  const hash = contentHash(parsed.doc);
  if (hash === prev.contentSha256) return { ok: true, rev: prev.rev, savedAt: prev.updatedAt.toISOString(), unchanged: true, contentSha256: hash };

  const now = new Date();
  const reopen = prev.status !== "clone_draft";
  const after = await (await cfClones()).findOneAndUpdate(
    { _id: prev._id, rev: input.baseRev, lockedAt: null, signatureCount: 0, status: { $in: [...EDITABLE_CLONE_STATUSES] } } as never,
    { $set: { pbdoc: parsed.doc, contentSha256: hash, updatedAt: now, lastEditorId: v.userId, ...(reopen ? { status: "clone_draft", frozenContentSha256: null, requestId: null } : {}) }, $inc: { rev: 1 } },
    { returnDocument: "after" }
  );
  if (!after) {
    const cur = await (await cfClones()).findOne({ _id: prev._id });
    if (cur && isCloneLocked(cur)) return fail("locked", "A signature has been applied, so this document can no longer be edited. Void it and create a new one to make changes.");
    if (cur && cur.rev !== input.baseRev) return fail("conflict", "Someone else changed this document. Reload to see their changes.", { currentRev: cur.rev });
    return fail("bad_status", "This document can no longer be edited.");
  }
  const diff = diffDocs(prev.pbdoc, parsed.doc);
  await audit(prev._id, "edit", after.rev, v.userId, summarizeDiff(diff), { diff: diffEntries(diff), beforeSha256: prev.contentSha256, afterSha256: hash });
  await recordVersion(after, after.rev, { id: v.userId, name: v.email }, input.note ?? summarizeDiff(diff), input.source ?? "edit");
  if (reopen) {
    await audit(prev._id, "reopened", after.rev, v.userId, `Edited while ${prev.status.replace("_", " ")}; back to draft and the rendered copy was dropped`, { detail: { from: prev.status } });
    if (prev.requestId) {
      // Links already sent point at content that no longer exists: switch them off. The signers must be sent a fresh request.
      await closeRequest(prev.requestId, "The document was edited after it was sent.", { type: "user", id: v.userId }).catch(() => {});
    }
  }
  return { ok: true, rev: after.rev, savedAt: now.toISOString(), unchanged: false, contentSha256: hash };
}

/** A second line of defence behind `lockedAt`: a signed signer on any request of this clone locks it, whoever forgot to call `markSignatureApplied`. */
async function lockedBySignature(c: CloneDoc): Promise<boolean> {
  if (isCloneLocked(c)) return true;
  const requests = await (await cfRequests()).find({ cloneId: c._id }, { projection: { _id: 1 } }).toArray();
  if (requests.length === 0) return false;
  const signed = await (await cfSigners()).countDocuments({ requestId: { $in: requests.map((r) => r._id) }, status: "signed" });
  if (signed === 0) return false;
  await (await cfClones()).updateOne({ _id: c._id, lockedAt: null }, { $set: { lockedAt: new Date() }, $max: { signatureCount: signed } });
  return true;
}

/**
 * Called by the signing step in the same breath as it records a signature. Locks the content for good. `complete` = every signer has signed.
 * Idempotent per call count: each call adds one signature.
 */
export async function markSignatureApplied(cloneId: string, opts: { complete?: boolean; by?: string | null } = {}): Promise<boolean> {
  const now = new Date();
  const r = await (await cfClones()).findOneAndUpdate(
    { _id: cloneId, status: { $in: ["ready", "sent", "partially_signed"] } } as never,
    { $set: { status: opts.complete ? "signed" : "partially_signed", updatedAt: now }, $inc: { signatureCount: 1 }, $min: { lockedAt: now } },
    { returnDocument: "after" }
  );
  if (!r) return false;
  if (!r.lockedAt) await (await cfClones()).updateOne({ _id: cloneId, lockedAt: null }, { $set: { lockedAt: now } });
  await markVersionStatus(cloneId, r.rev, opts.complete ? "signed" : "partly signed");
  await audit(cloneId, "signature_applied", r.rev, opts.by ?? null, `Signature ${r.signatureCount} applied; the document is locked`, { detail: { complete: !!opts.complete } });
  return true;
}

// ── States ─────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Marks the clone ready to send: its content is fixed for sending and its hash recorded. The caller (the action) renders the PDF first so a
 * document that cannot be rendered, or still has unfilled fields, is refused before it reaches a signer.
 */
export async function markCloneReady(v: LpmsViewer, id: string, opts: { rendered: boolean }): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!canManageClone(v)) return fail("forbidden", "You may not prepare documents for signature.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  if (!opts.rendered) return fail("invalid", "The document must be rendered before it can be marked ready.");
  const after = await (await cfClones()).findOneAndUpdate({ _id: id, status: "clone_draft", lockedAt: null, signatureCount: 0, rev: l.clone.rev } as never, { $set: { status: "ready", frozenContentSha256: l.clone.contentSha256, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!after) return fail("bad_status", "Only a draft that nobody is editing can be marked ready.");
  await markVersionStatus(id, after.rev, "ready");
  await audit(id, "ready", after.rev, v.userId, "Marked ready to send", { afterSha256: after.contentSha256 });
  return { ok: true, clone: after };
}

/** Void: allowed at any point (even after signatures: that is the way out of the lock). Needs a reason; revokes links; keeps all evidence. */
export async function voidClone(v: LpmsViewer, id: string, reason: string): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!canManageClone(v)) return fail("forbidden", "You may not void documents.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const why = clean(reason, 500);
  if (why.length < 3) return fail("invalid", "Give a reason for voiding this document.");
  if (l.clone.status === "voided") return { ok: true, clone: l.clone };
  if (l.clone.status === "signed") return fail("bad_status", "A fully signed document cannot be voided here.");
  const now = new Date();
  const after = await (await cfClones()).findOneAndUpdate({ _id: id, status: { $ne: "voided" } } as never, { $set: { status: "voided", voidReason: why, voidedAt: now, updatedAt: now } }, { returnDocument: "after" });
  if (!after) return { ok: true, clone: (await (await cfClones()).findOne({ _id: id }))! };
  if (l.clone.requestId) await closeRequest(l.clone.requestId, `Document voided: ${why}`, { type: "user", id: v.userId }).catch(() => {});
  await markVersionStatus(id, after.rev, "voided", why);
  await audit(id, "void", after.rev, v.userId, `Voided: ${why}`, { detail: { hadSignatures: after.signatureCount > 0, signatureCount: after.signatureCount } });
  return { ok: true, clone: after };
}

/**
 * Creates the replacement of a voided clone. `basis` "edited" copies the voided clone's current content (with its edits); "source" starts
 * again from the Playbook version. The two are linked both ways and both audits record it. The voided clone is not touched otherwise.
 */
export async function recloneVoided(v: LpmsViewer, id: string, opts: { basis: "edited" | "source"; signers?: NewSigner[] }): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!canManageClone(v)) return fail("forbidden", "You may not create documents for signature.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const old = l.clone;
  if (old.status !== "voided") return fail("bad_status", "Only a voided document can be replaced.");
  if (old.replacedBy) return fail("bad_status", "This document has already been replaced.");
  let pbdoc: PBDoc = old.pbdoc;
  let version: PbVersionRecord | null = null;
  if (opts.basis === "source") {
    version = await readSourceVersion(old);
    if (!version) return fail("source_unavailable", "The Playbook version this was cloned from is no longer available. Use the edited copy instead.");
    const ok = verifiedSource(version);
    if (!ok.ok) return ok;
    pbdoc = ok.pbdoc;
  }
  const src: CloneSourceContent = {
    version: {
      _id: old.source.versionId, documentId: old.source.documentId, number: old.source.versionNumber, pbdoc, contentSha256: old.source.sourceContentSha256,
      variableSnapshot: old.variableSnapshot, docNumber: old.source.docNumber, templateRef: old.source.templateRef, title: old.title, status: "issued",
    },
    docTypeId: old.source.docTypeId,
  };
  const created = await insertClone({ id: v.userId }, src, pbdoc, { title: old.title, party: { type: old.party.type, partyId: old.party.partyId, displayName: old.party.displayName }, signers: opts.signers ?? old.signerPlan, dates: old.dates, stamp: old.stamp, options: old.options }, { replaces: old._id, kind: old.kind, meta: old.meta });
  if (!created.ok) return created;
  const linked = await (await cfClones()).updateOne({ _id: old._id, replacedBy: null }, { $set: { replacedBy: created.clone._id } });
  if (linked.matchedCount === 0) {
    // Someone replaced it at the same moment: keep theirs, remove ours (it was just created and has no history worth keeping beyond its own audit).
    await (await cfClones()).updateOne({ _id: created.clone._id }, { $set: { status: "voided", voidReason: "Duplicate replacement", voidedAt: new Date() } });
    return fail("bad_status", "This document has already been replaced.");
  }
  await audit(old._id, "recloned_from", old.rev, v.userId, `Replaced by a new document (${opts.basis === "source" ? "from the Playbook version" : "from the edited copy"})`, { detail: { replacedBy: created.clone._id, basis: opts.basis } });
  return created;
}

// ── Redline against the source ────────────────────────────────────────────────────────────────────────────────
/** The clone compared with the Playbook version it came from. Read only. `sourceAvailable: false` when that version is gone. */
export async function compareWithSource(v: LpmsViewer, id: string): Promise<CloneResult<{ sourceAvailable: boolean; diff: DocDiff | null; summary: string; edited: boolean }>> {
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const c = l.clone;
  const version = await readSourceVersion(c);
  if (!version) return { ok: true, sourceAvailable: false, diff: null, summary: "The Playbook version is no longer available.", edited: editedAfterCloning(c) };
  const diff = diffDocs(version.pbdoc, c.pbdoc);
  return { ok: true, sourceAvailable: true, diff, summary: summarizeDiff(diff), edited: editedAfterCloning(c) };
}


// ── Restore, delete, send plan (P7, P8) ───────────────────────────────────────────────────────────────────────
/** Makes an older version's content the newest version (history is never rewritten). Same rules as any edit: refused once a signature exists. */
export async function restoreCloneVersion(v: LpmsViewer, id: string, number: number, baseRev: number, note?: string): Promise<CloneResult<{ rev: number }>> {
  const row = Number.isInteger(number) ? await (await cfCloneVersions()).findOne({ cloneId: String(id).slice(0, 64), number }) : null;
  if (!row) return fail("not_found", "That version does not exist.");
  const r = await saveCloneContent(v, { id, doc: row.pbdoc, baseRev, source: "restore", note: note ?? `Restored version ${number}` });
  return r.ok ? { ok: true, rev: r.rev } : r;
}

/** Soft delete: the clone leaves every list. Not allowed once anyone has signed (the signatures are evidence). An open request is switched off. */
export async function deleteClone(v: LpmsViewer, id: string): Promise<CloneResult> {
  if (!canManageClone(v) && !canEditClone(v)) return fail("forbidden", "You may not delete documents.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const c = l.clone;
  if (c.deletedAt) return { ok: true };
  if (c.signatureCount > 0 || c.status === "partially_signed" || c.status === "signed") return fail("bad_status", "A document that has been signed, even in part, is kept as a record. It cannot be deleted.");
  if (c.requestId) await closeRequest(c.requestId, "The document was deleted.", { type: "user", id: v.userId }).catch(() => {});
  const now = new Date();
  await (await cfClones()).updateOne({ _id: c._id, signatureCount: 0 }, { $set: { deletedAt: now, updatedAt: now } });
  await audit(c._id, "deleted", c.rev, v.userId, "Deleted", { detail: { deleted: true } });
  return { ok: true };
}

export interface SendPlanInput {
  party?: { type: string; partyId?: string | null; displayName?: string };
  signers: NewSigner[];
  orderMode?: "parallel" | "sequential";
  expiryDays?: number;
}

/**
 * Sets who the clone goes to and who signs, before sending. Allowed while the clone is a draft or ready (never after it is sent: void it
 * and replace it instead). Returns the clone.
 */
export async function updateSendPlan(v: LpmsViewer, id: string, input: SendPlanInput): Promise<CloneResult<{ clone: CloneDoc }>> {
  if (!canManageClone(v)) return fail("forbidden", "You may not prepare documents for signature.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const c = l.clone;
  if (c.status !== "clone_draft" && c.status !== "ready") return fail("bad_status", "The recipients can only be changed before the document is sent.");
  const signers = checkSigners(input.signers);
  if (!signers.ok) return signers;
  let party = c.party;
  if (input.party) {
    const p = await resolveParty(input.party);
    if (!p.ok) return p;
    party = p.party;
  }
  const expiry = Number.isInteger(input.expiryDays) && (input.expiryDays as number) >= 1 && (input.expiryDays as number) <= 365 ? (input.expiryDays as number) : c.options.expiryDays;
  const after = await (await cfClones()).findOneAndUpdate(
    { _id: c._id, status: { $in: ["clone_draft", "ready"] }, lockedAt: null } as never,
    { $set: { party, signerPlan: signers.signers, options: { ...c.options, orderMode: input.orderMode === "sequential" ? "sequential" : "parallel", expiryDays: expiry }, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return after ? { ok: true, clone: after } : fail("bad_status", "The document changed. Reload and try again.");
}

/** Counts for the dashboard, from the clones the viewer can see. */
export async function cloneStats(v: LpmsViewer): Promise<{ total: number; draft: number; waiting: number; sent: number; viewed: number; signed: number; rejected: number; expiring: number; byKind: Record<string, number> }> {
  const rows = await listClones(v, { limit: 500 });
  const out = { total: rows.length, draft: 0, waiting: 0, sent: 0, viewed: 0, signed: 0, rejected: 0, expiring: 0, byKind: { sop: 0, document: 0, kpi: 0 } as Record<string, number> };
  const requestIds = rows.filter((r) => r.status === "sent" && r.requestId).map((r) => r.requestId as string);
  const viewed = new Set<string>();
  const soon = new Set<string>();
  if (requestIds.length) {
    for (const s of await (await cfSigners()).find({ requestId: { $in: requestIds }, documentViewedAt: { $ne: null } }, { projection: { requestId: 1 } } as never).toArray()) viewed.add(s.requestId);
    const limit = new Date(Date.now() + 3 * 86_400_000);
    for (const r of await (await cfRequests()).find({ _id: { $in: requestIds }, expiresAt: { $lte: limit } }, { projection: { _id: 1 } }).toArray()) soon.add(r._id);
  }
  for (const r of rows) {
    out.byKind[r.kind ?? "document"] = (out.byKind[r.kind ?? "document"] ?? 0) + 1;
    if (r.status === "clone_draft") out.draft++;
    else if (r.status === "ready") out.waiting++;
    else if (r.status === "sent") { out.sent++; if (r.requestId && viewed.has(r.requestId)) out.viewed++; if (r.requestId && soon.has(r.requestId)) out.expiring++; }
    else if (r.status === "partially_signed") { out.sent++; }
    else if (r.status === "signed") out.signed++;
    else if (r.status === "declined") out.rejected++;
  }
  return out;
}

/** Renames a clone (title only; the content and its versions are untouched). Allowed while the content may still be edited. */
export async function renameClone(v: LpmsViewer, id: string, title: string): Promise<CloneResult> {
  if (!canEditClone(v)) return fail("forbidden", "You may not edit documents.");
  const l = await loadClone(v, id);
  if (!l.ok) return l;
  const t = clean(title, 200);
  if (t.length < 1) return fail("invalid", "Give the document a title.");
  if (isCloneLocked(l.clone) || !(EDITABLE_CLONE_STATUSES as readonly string[]).includes(l.clone.status)) return fail("locked", "This document can no longer be renamed.");
  await (await cfClones()).updateOne({ _id: l.clone._id, lockedAt: null }, { $set: { title: t, updatedAt: new Date() } });
  await audit(l.clone._id, "edit", l.clone.rev, v.userId, `Renamed to "${t}"`);
  return { ok: true };
}
