import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId } from "@/lib/products/playbook-ai/db";
import { playbookCan } from "@/lib/playbook-roles";
import { emptyDoc, parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { validatePage, type PageSettings } from "@/lib/products/playbook-ai/doc/page";
import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import { contentHash } from "@/lib/products/playbook-ai/doc/hash";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { VarLists } from "@/lib/products/playbook-ai/doc/variables";
import {
  DOC_LINK_KEYS, LOCK_TTL_MS,
  type DocLinks, type InputValues, type MissingReport, type PbActor, type PbDocumentRecord, type PbDocumentSummary, type PbError, type PbLock,
  type PbPerson, type PbResult, type PbVersionRecord, type PbVersionSummary, type TemplateRef, type VariableSnapshot,
} from "@/lib/products/playbook-ai/documents-types";
import {
  TRANSITION_META, canEditDoc, canViewDoc, documentCapabilities, nextStatus, seesAllDocuments, transitionPermission,
  type AclEntry, type DocCapabilities, type DocStatus, type DocTransition, type PolicyContext, type StatusPolicy, type VersionKind,
} from "@/lib/products/playbook-ai/status";
import {
  attachSealedExport, getLatestVersion, getVersionByNumber, insertVersion, listVersionSummaries, purgeVersionsOfDocument,
} from "@/lib/products/playbook-ai/versions";
import { diffDocs, summarizeDiff, type DocDiff } from "@/lib/products/playbook-ai/diff";
import { listPbAudit, recordPbAudit, recordPbAuditThrottled, type PbAuditAction, type PbAuditEntry } from "@/lib/products/playbook-ai/pb-audit";
import { buildMissingReport } from "@/lib/products/playbook-ai/variables-registry";
import { buildVariableSnapshot, checkLinkChanges, loadVariableValues, type DocContext } from "@/lib/products/playbook-ai/variables-adapters";
import { allocateNumber, type Allocation } from "@/lib/products/playbook-ai/pb-numbering";
import { deniedCategories, getPbSettings, isLegalType, numberingFor, restrictedRoles, retentionMonthsFor, settingsStatusPolicy } from "@/lib/products/playbook-ai/pb-settings";
import { pbEvents } from "@/lib/products/playbook-ai/pb-notify";
import { cleanItemMeta, isItemKind, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import { hasDraftOnly, stripDraftOnly } from "@/lib/products/playbook-ai/tpl/strip";

/**
 * Documents data layer (`pb_documents`): the head and the editable draft of every Playbook document.
 *
 *  - Autosave carries the `rev` it was based on. A save from a stale `rev` is REJECTED with a typed `conflict` error naming who changed
 *    the document and when; nothing is ever overwritten silently.
 *  - An optional edit lock (expires) keeps a second editor out while someone is actively editing.
 *  - Versions are immutable rows in `pb_versions`; every freezing step (submit, approve, issue, revert, saved version) writes one.
 *  - Status changes follow `status.ts`; the approval policy (auto-approve own documents, require a different approver) is a hook that
 *    A10 installs with `setStatusPolicy`.
 *
 * Every function takes the acting user and checks `playbookCan` plus object access itself; expected failures come back as
 * `{ ok: false, error }` with a typed `PbError`, never as exceptions.
 */

export { attachSealedExport };

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<PbDocumentRecord>(PB_COLLECTIONS.documents);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ status: 1, updatedAt: -1 }).catch(() => {}),
      c.createIndex({ createdBy: 1, updatedAt: -1 }).catch(() => {}),
      c.createIndex({ "acl.userId": 1 }).catch(() => {}),
      c.createIndex({ deletedAt: 1 }).catch(() => {}),
      c.createIndex({ docTypeId: 1, updatedAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

/** Test hook: forget that indexes were created (after the test drops its database). */
export function resetPbDocumentIndexes(): void {
  indexesEnsured = false;
}

let policy: StatusPolicy = settingsStatusPolicy;
/** Replaces the approval policy (tests use `NEUTRAL_STATUS_POLICY`). The default reads the company's approval settings. */
export function setStatusPolicy(p: StatusPolicy): void {
  policy = p;
}

const person = (a: PbActor): PbPerson => ({ id: a.id, name: a.name, email: a.email });
const fail = <T>(error: PbError): PbResult<T> => ({ ok: false, error });
const err = {
  notFound: (): PbError => ({ code: "not_found", message: "This document does not exist or you cannot open it." }),
  forbidden: (what: string): PbError => ({ code: "forbidden", message: `You are not allowed to ${what}.` }),
};

function istTime(d: Date): string {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

function conflictError(doc: PbDocumentRecord, yourRev: number): PbError {
  const who = doc.lastEditor;
  const by = who?.name || who?.email || "Someone";
  const when = who?.at ?? doc.updatedAt;
  return {
    code: "conflict",
    message: `${by} changed this document at ${istTime(when)} (revision ${doc.rev}; yours was ${yourRev}). Reload to see their changes, or copy your edits first. Nothing was overwritten.`,
    currentRev: doc.rev,
    yourRev,
    changedBy: who ? { id: who.id, name: who.name, email: who.email } : null,
    changedAt: when.toISOString(),
  };
}

function lockError(lock: PbLock): PbError {
  return {
    code: "locked",
    message: `${lock.name || "Someone"} is editing this document until ${istTime(lock.expiresAt)}. Try again then, or ask an administrator to release the lock.`,
    lockedBy: { id: lock.userId, name: lock.name, email: null },
    expiresAt: lock.expiresAt.toISOString(),
  };
}

const activeLock = (d: PbDocumentRecord, now = new Date()): PbLock | null => (d.lock && d.lock.expiresAt > now ? d.lock : null);
const blockedByLock = (d: PbDocumentRecord, actor: PbActor): PbError | null => {
  const l = activeLock(d);
  return l && l.userId !== actor.id ? lockError(l) : null;
};
const lockFreeFor = (actor: PbActor, now: Date) => ({ $or: [{ lock: null }, { "lock.expiresAt": { $lte: now } }, { "lock.userId": actor.id }] });

function withoutExpiredLock(d: PbDocumentRecord): PbDocumentRecord {
  return d.lock && d.lock.expiresAt <= new Date() ? { ...d, lock: null } : d;
}

type Loaded = { ok: true; doc: PbDocumentRecord } | { ok: false; error: PbError };

/** Loads a live (not deleted) document the actor may open. A document they may not open is reported as not found. */
async function load(actor: PbActor, id: string, need: "view" | "edit" = "view", includeDeleted = false): Promise<Loaded> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, error: err.notFound() };
  const c = await col();
  const doc = await c.findOne(includeDeleted ? { _id: id } : { _id: id, deletedAt: null });
  if (!doc || !canViewDoc(actor, doc)) return { ok: false, error: err.notFound() };
  if (doc.docTypeId && doc.createdBy !== actor.id) {
    // Category access: HR documents only to HR roles, finance only to finance roles, as the company set it.
    const allowed = restrictedRoles(await getPbSettings(), doc.docTypeId);
    if (allowed && !actor.roles.includes("super_admin") && !allowed.some((r) => actor.roles.includes(r))) return { ok: false, error: err.notFound() };
  }
  if (need === "edit" && !canEditDoc(actor, doc)) return { ok: false, error: err.forbidden("edit this document") };
  return { ok: true, doc };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------------------------------------------------------------

const INPUT_KEY_RE = /^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39}){0,2}$/;
const MAX_INPUTS = 200;
const MAX_LISTS_BYTES = 200_000;

function cleanInputs(v: unknown): { ok: true; value: InputValues } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: {} };
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, message: "inputs must be an object" };
  const out: InputValues = {};
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > MAX_INPUTS) return { ok: false, message: `inputs may hold at most ${MAX_INPUTS} values` };
  for (const [k, val] of entries) {
    if (!INPUT_KEY_RE.test(k)) return { ok: false, message: `"${k}" is not a valid input name` };
    if (typeof val === "string") {
      if (val.length > 5000) return { ok: false, message: `"${k}" is too long` };
      out[k] = val;
    } else if ((typeof val === "number" && Number.isFinite(val)) || typeof val === "boolean") out[k] = val;
    else return { ok: false, message: `"${k}" must be text, a number or yes/no` };
  }
  return { ok: true, value: out };
}

function cleanLists(v: unknown): { ok: true; value: VarLists } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: {} };
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, message: "lists must be an object" };
  if (JSON.stringify(v).length > MAX_LISTS_BYTES) return { ok: false, message: "lists are too large" };
  const out: VarLists = {};
  for (const [k, rows] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || !Array.isArray(rows) || rows.length > 500) return { ok: false, message: `list "${k}" is not valid` };
    if (!rows.every((r) => typeof r === "object" && r !== null && !Array.isArray(r))) return { ok: false, message: `list "${k}" must hold records` };
    out[k] = rows as Array<Record<string, unknown>>;
  }
  return { ok: true, value: out };
}

function cleanLinks(v: unknown): { ok: true; value: DocLinks } | { ok: false; message: string } {
  if (v === undefined) return { ok: true, value: {} };
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, message: "links must be an object" };
  const out: DocLinks = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!(DOC_LINK_KEYS as readonly string[]).includes(k)) return { ok: false, message: `unknown link "${k}"` };
    if (val === null || val === undefined || val === "") out[k as keyof DocLinks] = null;
    else if (typeof val === "string" && val.length <= 64) out[k as keyof DocLinks] = val;
    else return { ok: false, message: `link "${k}" is not valid` };
  }
  return { ok: true, value: out };
}

const cleanTitle = (t: unknown): string | null => (typeof t === "string" && t.trim().length >= 1 && t.trim().length <= 200 ? t.trim() : null);

function parseContent(input: unknown): { ok: true; doc: PBDoc } | { ok: false; error: PbError } {
  const r = parseDoc(input, { assignIds: true });
  if (!r.ok) return { ok: false, error: { code: "invalid", message: "The document content is not valid.", issues: r.issues.slice(0, 20).map((i) => ({ path: i.path, message: i.message })) } };
  return { ok: true, doc: r.doc };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Create, read, list
// ---------------------------------------------------------------------------------------------------------------------------------

export interface CreateDocumentInput {
  title: string;
  pbdoc?: unknown;
  docTypeId?: string | null;
  kind?: ItemKind;
  meta?: unknown;
  templateRef?: TemplateRef | null;
  inputs?: unknown;
  lists?: unknown;
  links?: unknown;
}

export async function createDocument(actor: PbActor, input: CreateDocumentInput): Promise<PbResult<{ document: PbDocumentRecord }>> {
  if (!playbookCan(actor, "CREATE")) return fail(err.forbidden("create documents"));
  const title = cleanTitle(input.title);
  if (!title) return fail({ code: "invalid", message: "Give the document a title of up to 200 characters.", issues: [{ path: "title", message: "required" }] });
  const content = input.pbdoc === undefined ? { ok: true as const, doc: emptyDoc() } : parseContent(input.pbdoc);
  if (!content.ok) return fail(content.error);
  const inputs = cleanInputs(input.inputs), lists = cleanLists(input.lists), links = cleanLinks(input.links);
  for (const r of [inputs, lists, links]) if (!r.ok) return fail({ code: "invalid", message: r.message, issues: [] });
  const linkProblem = await checkLinkChanges(actor, {}, (links as { value: DocLinks }).value);
  if (linkProblem) return fail({ code: "forbidden", message: linkProblem });
  const now = new Date();
  const me = person(actor);
  const doc: PbDocumentRecord = {
    _id: newId(), title, docTypeId: input.docTypeId ?? null, kind: isItemKind(input.kind) ? input.kind : "document", meta: cleanItemMeta(input.meta), templateRef: input.templateRef ?? null, status: "draft", archivedFrom: null,
    pbdoc: content.doc, contentSha256: contentHash(content.doc), rev: 1, versionSeq: 0, latestVersion: null, issuedVersion: null, docNumber: null,
    inputs: (inputs as { value: InputValues }).value, lists: (lists as { value: VarLists }).value, links: (links as { value: DocLinks }).value,
    acl: [], lock: null, lastEditor: { ...me, at: now }, review: null, legalHold: false,
    createdAt: now, updatedAt: now, createdBy: actor.id, updatedBy: actor.id, deletedAt: null, deletedBy: null, issuedAt: null,
  };
  const c = await col();
  await c.insertOne(doc);
  await recordPbAudit({ actor, action: "create", entity: "document", entityId: doc._id, summary: `Created "${title}"` });
  return { ok: true, document: doc };
}

export async function getDocument(actor: PbActor, id: string): Promise<PbResult<{ document: PbDocumentRecord; capabilities: DocCapabilities }>> {
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  return { ok: true, document: withoutExpiredLock(l.doc), capabilities: documentCapabilities(actor, l.doc) };
}

export interface ListDocumentsInput {
  status?: DocStatus | DocStatus[];
  q?: string;
  docTypeId?: string;
  kind?: ItemKind;
  /** Only the documents in the trash (needs EDIT). */
  deleted?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listDocuments(actor: PbActor, input: ListDocumentsInput = {}): Promise<PbResult<{ items: PbDocumentSummary[]; total: number; page: number; pageSize: number }>> {
  if (!playbookCan(actor, "VIEW")) return fail(err.forbidden("view documents"));
  const filter: Record<string, unknown> = { deletedAt: input.deleted ? { $ne: null } : null };
  if (!seesAllDocuments(actor)) filter.$or = [{ createdBy: actor.id }, { "acl.userId": actor.id }];
  if (input.status) filter.status = Array.isArray(input.status) ? { $in: input.status } : input.status;
  if (input.docTypeId) filter.docTypeId = input.docTypeId;
  if (input.kind) filter.kind = input.kind === "document" ? { $in: ["document", null] } : input.kind;
  const denied = deniedCategories(await getPbSettings(), actor);
  const and: unknown[] = [];
  if (denied.length) and.push({ $or: [{ docTypeId: null }, { createdBy: actor.id }, { docTypeId: { $not: new RegExp(`^(${denied.join("|")})\\.`) } }] });
  if (input.q && input.q.trim()) {
    const rx = new RegExp(input.q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({ $or: [{ title: rx }, { docNumber: rx }] });
  }
  if (and.length) filter.$and = and;
  const page = Math.max(Math.floor(input.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(input.pageSize ?? 25), 1), 100);
  const c = await col();
  const [items, total] = await Promise.all([
    c.find(filter as never, { projection: { pbdoc: 0, inputs: 0, lists: 0 } }).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    c.countDocuments(filter as never),
  ]);
  return { ok: true, items: items as PbDocumentSummary[], total, page, pageSize };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Autosave with revision check
// ---------------------------------------------------------------------------------------------------------------------------------

/** Works out why an atomic update matched nothing and returns the error the caller should see. */
async function diagnose(actor: PbActor, id: string, yourRev: number | null, expectStatus: DocStatus | null): Promise<PbError> {
  const c = await col();
  const cur = await c.findOne({ _id: id, deletedAt: null });
  if (!cur || !canViewDoc(actor, cur)) return err.notFound();
  if (expectStatus && cur.status !== expectStatus) {
    return { code: "bad_status", message: `This document is ${cur.status.replace("_", " ")}, so that is not possible now.`, status: cur.status };
  }
  const lk = blockedByLock(cur, actor);
  if (lk) return lk;
  if (yourRev !== null && cur.rev !== yourRev) return conflictError(cur, yourRev);
  return { code: "conflict", message: "The document changed while you were saving. Reload and try again. Nothing was overwritten.", currentRev: cur.rev, yourRev: yourRev ?? cur.rev, changedBy: cur.lastEditor ? { id: cur.lastEditor.id, name: cur.lastEditor.name, email: cur.lastEditor.email } : null, changedAt: (cur.lastEditor?.at ?? cur.updatedAt).toISOString() };
}

export interface SaveDraftInput {
  id: string;
  /** The revision this edit was based on (from the last load or save). */
  rev: number;
  pbdoc: unknown;
  title?: string;
  inputs?: unknown;
  lists?: unknown;
  links?: unknown;
  docTypeId?: string | null;
}

export async function saveDraft(actor: PbActor, input: SaveDraftInput, auditAction: PbAuditAction = "edit"): Promise<PbResult<{ rev: number; savedAt: string; unchanged: boolean; contentSha256: string }>> {
  const l = await load(actor, input.id, "edit");
  if (!l.ok) return fail(l.error);
  const doc = l.doc;
  if (doc.status !== "draft") return fail({ code: "bad_status", message: `A ${doc.status.replace("_", " ")} document cannot be edited. Revise it first.`, status: doc.status });
  const content = parseContent(input.pbdoc);
  if (!content.ok) return fail(content.error);
  const title = input.title === undefined ? doc.title : cleanTitle(input.title);
  if (!title) return fail({ code: "invalid", message: "Give the document a title of up to 200 characters.", issues: [{ path: "title", message: "required" }] });
  const inputs = input.inputs === undefined ? ({ ok: true, value: doc.inputs } as const) : cleanInputs(input.inputs);
  const lists = input.lists === undefined ? ({ ok: true, value: doc.lists } as const) : cleanLists(input.lists);
  const links = input.links === undefined ? ({ ok: true, value: doc.links } as const) : cleanLinks(input.links);
  for (const r of [inputs, lists, links]) if (!r.ok) return fail({ code: "invalid", message: r.message, issues: [] });
  const next = {
    inputs: (inputs as { value: InputValues }).value,
    lists: (lists as { value: VarLists }).value,
    links: { ...doc.links, ...(links as { value: DocLinks }).value },
    docTypeId: input.docTypeId === undefined ? doc.docTypeId : input.docTypeId,
  };
  const linkProblem = await checkLinkChanges(actor, doc.links, next.links);
  if (linkProblem) return fail({ code: "forbidden", message: linkProblem });
  const sha = contentHash(content.doc);
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  const unchanged = sha === doc.contentSha256 && title === doc.title && same(next.inputs, doc.inputs) && same(next.lists, doc.lists) && same(next.links, doc.links) && next.docTypeId === doc.docTypeId;
  if (unchanged && doc.rev === input.rev) return { ok: true, rev: doc.rev, savedAt: doc.updatedAt.toISOString(), unchanged: true, contentSha256: sha };

  const now = new Date();
  const holdsLock = activeLock(doc, now)?.userId === actor.id;
  const c = await col();
  const res = await c.findOneAndUpdate(
    { _id: doc._id, deletedAt: null, status: "draft", rev: input.rev, ...lockFreeFor(actor, now) } as never,
    {
      $set: {
        title, pbdoc: content.doc, contentSha256: sha, ...next, updatedAt: now, updatedBy: actor.id, lastEditor: { ...person(actor), at: now },
        ...(holdsLock ? { "lock.expiresAt": new Date(now.getTime() + LOCK_TTL_MS) } : {}),
      },
      $inc: { rev: 1 },
    },
    { returnDocument: "after" }
  );
  if (!res) return fail(await diagnose(actor, doc._id, input.rev, "draft"));
  await recordPbAuditThrottled({ actor, action: auditAction, entity: "document", entityId: doc._id, summary: "Edited the draft" });
  return { ok: true, rev: res.rev, savedAt: now.toISOString(), unchanged: false, contentSha256: sha };
}

/** Changes the document's page settings (size, orientation, margins, header and footer zones). Stored inside the document content. */
export async function updatePageSettings(actor: PbActor, input: { id: string; rev: number; page: unknown }): Promise<PbResult<{ rev: number; page: PageSettings }>> {
  const v = validatePage(input.page);
  if (!v.ok) return fail({ code: "invalid", message: v.errors[0], issues: v.errors.map((m) => ({ path: "page", message: m })) });
  const l = await load(actor, input.id, "edit");
  if (!l.ok) return fail(l.error);
  const r = await saveDraft(actor, { id: input.id, rev: input.rev, pbdoc: { ...l.doc.pbdoc, page: v.value } }, "page_settings");
  if (!r.ok) return fail(r.error);
  await recordPbAudit({ actor, action: "page_settings", entity: "document", entityId: input.id, summary: "Changed page settings", metadata: { page: v.value } });
  return { ok: true, rev: r.rev, page: v.value };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Edit lock
// ---------------------------------------------------------------------------------------------------------------------------------

/** Takes (or renews) the edit lock for the actor. Fails with `locked` while someone else holds an unexpired lock. */
export async function acquireLock(actor: PbActor, id: string): Promise<PbResult<{ lock: PbLock }>> {
  const l = await load(actor, id, "edit");
  if (!l.ok) return fail(l.error);
  const now = new Date();
  const lock: PbLock = { userId: actor.id, name: actor.name || actor.email, acquiredAt: now, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) };
  const c = await col();
  const mine = activeLock(l.doc, now)?.userId === actor.id;
  const r = await c.findOneAndUpdate(
    { _id: id, deletedAt: null, status: "draft", ...lockFreeFor(actor, now) } as never,
    { $set: { lock: mine && l.doc.lock ? { ...l.doc.lock, expiresAt: lock.expiresAt } : lock } },
    { returnDocument: "after" }
  );
  if (!r) return fail(await diagnose(actor, id, null, "draft"));
  if (!mine) await recordPbAudit({ actor, action: "lock", entity: "document", entityId: id, summary: "Started editing" });
  return { ok: true, lock: r.lock! };
}

export async function releaseLock(actor: PbActor, id: string): Promise<PbResult<object>> {
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  const c = await col();
  const r = await c.updateOne({ _id: id, "lock.userId": actor.id } as never, { $set: { lock: null } });
  if (r.modifiedCount) await recordPbAudit({ actor, action: "unlock", entity: "document", entityId: id, summary: "Stopped editing" });
  return { ok: true };
}

/** An administrator (SETTINGS) releases someone else's lock. */
export async function breakLock(actor: PbActor, id: string): Promise<PbResult<object>> {
  if (!playbookCan(actor, "SETTINGS")) return fail(err.forbidden("release another person's edit lock"));
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  const c = await col();
  await c.updateOne({ _id: id } as never, { $set: { lock: null } });
  await recordPbAudit({ actor, action: "lock_broken", entity: "document", entityId: id, summary: "Released the edit lock", metadata: { heldBy: l.doc.lock?.userId ?? null } });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------------------------------------------------------------

interface VersionExtras { label?: string | null; changeNote?: string | null; revertedFrom?: number | null; variableSnapshot?: VariableSnapshot | null }

/** Freezes the state of `after` (a document just returned by an atomic update that also bumped `versionSeq`) into an immutable version. */
async function freeze(actor: Pick<PbActor, "id" | "name" | "email">, after: PbDocumentRecord, kind: VersionKind, x: VersionExtras = {}): Promise<PbVersionRecord> {
  return insertVersion({
    documentId: after._id, number: after.versionSeq, kind, label: x.label ?? null, changeNote: x.changeNote ?? null, title: after.title, status: after.status,
    docNumber: after.docNumber, pbdoc: after.pbdoc, contentSha256: after.contentSha256, variableSnapshot: x.variableSnapshot ?? null,
    templateRef: after.templateRef, revertedFrom: x.revertedFrom ?? null, authorId: actor.id, authorName: actor.name || actor.email,
  });
}

const cleanText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Saves the current draft as a named (`manual`) or checkpoint (`auto`) version. When the draft equals the latest version and no label is
 * given, nothing is created and the latest version is returned (`created: false`).
 */
export async function saveVersion(actor: PbActor, input: { id: string; label?: string; changeNote?: string; kind?: "manual" | "auto" }): Promise<PbResult<{ created: boolean; version: PbVersionSummary }>> {
  const l = await load(actor, input.id, "edit");
  if (!l.ok) return fail(l.error);
  const doc = l.doc;
  if (doc.status !== "draft") return fail({ code: "bad_status", message: "Only a draft can be saved as a version. Issued and approved documents already have theirs.", status: doc.status });
  const lk = blockedByLock(doc, actor);
  if (lk) return fail(lk);
  const label = cleanText(input.label, 120);
  const latest = await getLatestVersion(doc._id);
  if (latest && latest.contentSha256 === doc.contentSha256 && !label) {
    const { pbdoc: _p, variableSnapshot: _v, ...summary } = latest;
    void _p; void _v;
    return { ok: true, created: false, version: summary };
  }
  const c = await col();
  const after = await c.findOneAndUpdate(
    { _id: doc._id, deletedAt: null, status: "draft", rev: doc.rev } as never,
    { $inc: { versionSeq: 1 }, $set: { latestVersion: doc.versionSeq + 1 } },
    { returnDocument: "after" }
  );
  if (!after) return fail(await diagnose(actor, doc._id, doc.rev, "draft"));
  const v = await freeze(actor, after, input.kind ?? "manual", { label, changeNote: cleanText(input.changeNote, 1000) });
  await recordPbAudit({ actor, action: "save_version", entity: "version", entityId: v._id, documentId: doc._id, summary: `Saved version ${v.number}${label ? ` "${label}"` : ""}` });
  const { pbdoc: _p, variableSnapshot: _v, ...summary } = v;
  void _p; void _v;
  return { ok: true, created: true, version: summary };
}

export async function listDocumentVersions(actor: PbActor, id: string): Promise<PbResult<{ versions: PbVersionSummary[] }>> {
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  return { ok: true, versions: await listVersionSummaries(id) };
}

export async function getDocumentVersion(actor: PbActor, id: string, number: number): Promise<PbResult<{ version: PbVersionRecord }>> {
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  const v = await getVersionByNumber(id, number);
  return v ? { ok: true, version: v } : fail({ code: "not_found", message: "That version does not exist." });
}

/** Copies an old version into the draft and records that as a NEW version (history is never rewritten). */
export async function revertToVersion(actor: PbActor, input: { id: string; number: number; rev: number }): Promise<PbResult<{ rev: number; version: PbVersionSummary }>> {
  const l = await load(actor, input.id, "edit");
  if (!l.ok) return fail(l.error);
  const doc = l.doc;
  if (doc.status !== "draft") return fail({ code: "bad_status", message: "Revise the document first; only a draft can be reverted.", status: doc.status });
  const target = await getVersionByNumber(doc._id, input.number);
  if (!target) return fail({ code: "not_found", message: "That version does not exist." });
  const now = new Date();
  const c = await col();
  const after = await c.findOneAndUpdate(
    { _id: doc._id, deletedAt: null, status: "draft", rev: input.rev, ...lockFreeFor(actor, now) } as never,
    {
      $set: { pbdoc: target.pbdoc, contentSha256: target.contentSha256, title: target.title, updatedAt: now, updatedBy: actor.id, lastEditor: { ...person(actor), at: now }, latestVersion: doc.versionSeq + 1 },
      $inc: { rev: 1, versionSeq: 1 },
    },
    { returnDocument: "after" }
  );
  if (!after) return fail(await diagnose(actor, doc._id, input.rev, "draft"));
  const v = await freeze(actor, after, "revert", { label: `Reverted to version ${target.number}`, revertedFrom: target.number });
  await recordPbAudit({ actor, action: "revert", entity: "document", entityId: doc._id, summary: `Reverted to version ${target.number} (new version ${v.number})` });
  const { pbdoc: _p, variableSnapshot: _v, ...summary } = v;
  void _p; void _v;
  return { ok: true, rev: after.rev, version: summary };
}

export type CompareRef = number | "draft";

/** Compare data for the redline view: block diff, word diff, page and variable value changes. `draft` is the current editable content. */
export async function compareVersions(actor: PbActor, input: { id: string; from: CompareRef; to: CompareRef }): Promise<PbResult<{ diff: DocDiff; summary: string }>> {
  const l = await load(actor, input.id);
  if (!l.ok) return fail(l.error);
  const side = async (ref: CompareRef) => {
    if (ref === "draft") return { doc: l.doc.pbdoc, values: undefined };
    const v = await getVersionByNumber(l.doc._id, ref);
    return v ? { doc: v.pbdoc, values: v.variableSnapshot?.values } : null;
  };
  const [a, b] = await Promise.all([side(input.from), side(input.to)]);
  if (!a || !b) return fail({ code: "not_found", message: "One of those versions does not exist." });
  const diff = diffDocs(a.doc, b.doc, { valuesBefore: a.values, valuesAfter: b.values });
  return { ok: true, diff, summary: summarizeDiff(diff) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------------------------------------------------------------

function docContext(d: PbDocumentRecord, version: number | null): DocContext {
  return { title: d.title, docNumber: d.docNumber, version, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy };
}

/** What is missing before this document can be issued, from live data (the actor's own read permissions apply). */
export async function getMissingDataReport(actor: PbActor, id: string): Promise<PbResult<{ report: MissingReport }>> {
  const l = await load(actor, id);
  if (!l.ok) return fail(l.error);
  const d = l.doc;
  // An issued document renders from its frozen snapshot, never from live data.
  if (d.issuedVersion !== null && d.status === "issued") {
    const v = await getVersionByNumber(d._id, d.issuedVersion);
    if (v?.variableSnapshot) return { ok: true, report: buildMissingReport({ doc: v.pbdoc, values: v.variableSnapshot.values, lists: v.variableSnapshot.lists, links: d.links }) };
  }
  const loaded = await loadVariableValues(actor, { doc: docContext(d, d.versionSeq + 1), links: d.links, inputs: d.inputs });
  return { ok: true, report: buildMissingReport({ doc: d.pbdoc, values: loaded.values, lists: d.lists, links: d.links, custom: loaded.custom, deniedNamespaces: loaded.denied }) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------------------------------------------------------------

export interface TransitionInput {
  id: string;
  transition: DocTransition;
  /** The revision the actor saw. Recommended for submit, optional elsewhere. */
  rev?: number;
  /** Required to send back (`reject`). */
  reason?: string;
  /** Issue only: overrides numbering with a caller-supplied number (tests, imports). Normally omitted: the company's numbering settings apply. */
  assignNumber?: (doc: PbDocumentRecord) => Promise<string>;
  /** Issue only, legal document types: the issuer confirms the document has been reviewed by a qualified lawyer. Recorded with user and time. */
  legalReviewConfirmed?: boolean;
  /** The clock, for tests of the financial-year rollover. Server code only: never pass a value that came from a browser. */
  now?: Date;
}

type TransitionOk = { document: PbDocumentRecord; version: PbVersionSummary | null; autoApproved: boolean };

const AUDIT_FOR: Record<DocTransition, PbAuditAction> = {
  submit: "submit", withdraw: "withdraw", approve: "approve", reject: "reject", revise: "revise", issue: "issue", archive: "archive", restore: "restore",
};

export async function transitionDocument(actor: PbActor, input: TransitionInput): Promise<PbResult<TransitionOk>> {
  const l = await load(actor, input.id);
  if (!l.ok) return fail(l.error);
  const doc = l.doc;
  const t = input.transition;
  const step = nextStatus(doc.status, t, doc.archivedFrom);
  if (!step.ok) return fail({ code: "bad_status", message: `Not possible: ${step.reason}.`, status: doc.status });
  const perm = transitionPermission(t, doc.status);
  if (!playbookCan(actor, perm)) return fail(err.forbidden(`${TRANSITION_META[t].label.toLowerCase()}`));
  if (perm !== "APPROVE" && perm !== "ISSUE" && !canEditDoc(actor, doc)) return fail(err.forbidden("change this document"));
  const reason = cleanText(input.reason, 1000);
  if (TRANSITION_META[t].needsReason && !reason) return fail({ code: "reason_required", message: "Give a reason so the author knows what to change." });
  if (t === "submit") { const lk = blockedByLock(doc, actor); if (lk) return fail(lk); }
  if (doc.legalHold && (t === "archive")) return fail({ code: "legal_hold", message: "This document is on legal hold." });

  const now = input.now ?? new Date();
  const set: Record<string, unknown> = { status: step.to, updatedAt: now, updatedBy: actor.id, lastEditor: { ...person(actor), at: now } };
  const filter: Record<string, unknown> = { _id: doc._id, deletedAt: null, status: doc.status, ...(input.rev !== undefined ? { rev: input.rev } : { rev: doc.rev }) };
  const inc: Record<string, number> = { rev: 1 };
  const kind: VersionKind | null = TRANSITION_META[t].version;
  let extras: VersionExtras = {};
  let allocation: Allocation | null = null;
  const pctx: PolicyContext = { documentId: doc._id, docTypeId: doc.docTypeId, createdBy: doc.createdBy, submittedBy: doc.review?.submittedBy ?? null, actorId: actor.id };

  switch (t) {
    case "submit":
      set.review = { submittedBy: actor.id, submittedAt: now, decidedBy: null, decidedAt: null, decision: null, reason: null };
      break;
    case "withdraw":
    case "revise":
      set.review = null;
      break;
    case "approve":
      if ((await policy.requireDifferentApprover(pctx)) && (actor.id === pctx.submittedBy || actor.id === pctx.createdBy)) {
        return fail({ code: "self_approval", message: "A different person must approve this document." });
      }
      set.review = { ...(doc.review ?? { submittedBy: null, submittedAt: null }), decidedBy: actor.id, decidedAt: now, decision: "approved", reason: null };
      break;
    case "reject":
      set.review = { ...(doc.review ?? { submittedBy: null, submittedAt: null }), decidedBy: actor.id, decidedAt: now, decision: "rejected", reason };
      break;
    case "archive":
      set.archivedFrom = doc.status;
      break;
    case "restore":
      set.archivedFrom = null;
      break;
    case "issue": {
      // Freeze the variables first: nothing is issued with a required value missing.
      const nextVersion = doc.versionSeq + 1;
      // Reading the linked records is trusted here: the author linked them under their own permissions and the document is approved.
      const loaded = await loadVariableValues(actor, { doc: docContext({ ...doc, status: "issued", issuedAt: now }, nextVersion), links: doc.links, inputs: doc.inputs, now, trusted: true });
      const report = buildMissingReport({ doc: doc.pbdoc, values: loaded.values, lists: doc.lists, links: doc.links, custom: loaded.custom });
      if (!report.ok) return fail({ code: "unresolved_variables", message: `${report.missing.length + report.placeholders.length} item(s) must be filled before this can be issued.`, report });
      const settings = await getPbSettings();
      if (isLegalType(settings, doc.docTypeId)) {
        if (!input.legalReviewConfirmed) return fail({ code: "legal_ack_required", message: "Confirm that this document has been reviewed by a qualified lawyer before it is issued." });
        set.legalAck = { by: actor.id, at: now };
      }
      let number: string | null = doc.docNumber;
      if (!number) {
        try {
          if (input.assignNumber) number = await input.assignNumber(doc);
          else { allocation = await allocateNumber(numberingFor(settings, doc.docTypeId), now); number = allocation.number; }
        } catch (e) {
          return fail({ code: "invalid", message: e instanceof Error ? e.message : "A document number could not be assigned.", issues: [] });
        }
      }
      // The drafting notices (legal review, verification) are shown while drafting and are not part of the issued document.
      if (hasDraftOnly(doc.pbdoc)) { const stripped = stripDraftOnly(doc.pbdoc); set.pbdoc = stripped; set.contentSha256 = contentHash(stripped); }
      set.issuedAt = now;
      set.issuedVersion = nextVersion;
      set.latestVersion = nextVersion;
      set.docNumber = number;
      filter.versionSeq = doc.versionSeq;
      extras = { variableSnapshot: buildVariableSnapshot(doc.pbdoc, loaded, doc.lists, now) };
      break;
    }
  }
  if (kind) { inc.versionSeq = 1; if (t !== "issue") set.latestVersion = doc.versionSeq + 1; }

  const c = await col();
  const after = await c.findOneAndUpdate(filter as never, { $set: set, $inc: inc } as never, { returnDocument: "after" });
  if (!after) {
    // Lost the race: the number goes back to the counter so nobody ever sees a hole.
    await allocation?.release();
    return fail(await diagnose(actor, doc._id, input.rev ?? doc.rev, doc.status));
  }

  let version: PbVersionRecord | null = null;
  if (kind) {
    try {
      version = await freeze(actor, after, kind, extras);
    } catch (e) {
      // Put the document back the way it was; the version number is skipped.
      const back: Record<string, unknown> = {};
      for (const k of Object.keys(set)) back[k] = (doc as unknown as Record<string, unknown>)[k] ?? null;
      await c.updateOne({ _id: doc._id } as never, { $set: back, $inc: { rev: 1 } } as never);
      await allocation?.release();
      throw e;
    }
  }
  await recordPbAudit({
    actor, action: AUDIT_FOR[t], entity: "document", entityId: doc._id,
    summary: `${TRANSITION_META[t].label}${reason ? `: ${reason}` : ""}${t === "issue" && after.docNumber ? ` (${after.docNumber})` : ""}`,
    metadata: { from: doc.status, to: step.to, version: version?.number ?? null },
  });
  if (t === "issue" && set.legalAck) await recordPbAudit({ actor, action: "legal_ack", entity: "document", entityId: doc._id, summary: "Confirmed lawyer review before issue" });

  let result = after;
  let autoApproved = false;
  if (t === "submit" && (await policy.autoApproveOnSubmit({ ...pctx, submittedBy: actor.id }))) {
    const a = await autoApprove(actor, after);
    if (a) { result = a.doc; version = a.version; autoApproved = true; }
  }
  const nd = { id: doc._id, title: doc.title, docNumber: result.docNumber, createdBy: doc.createdBy, submittedBy: result.review?.submittedBy ?? doc.review?.submittedBy ?? null };
  if (t === "submit" && !autoApproved) await pbEvents.reviewRequested(nd, actor.id);
  else if (t === "approve") await pbEvents.approved(nd, actor.id, false);
  else if (t === "reject") await pbEvents.rejected(nd, actor.id, reason ?? "");
  else if (t === "issue") await pbEvents.issued(nd, actor.id);
  const summary = version ? (({ pbdoc: _p, variableSnapshot: _v, ...s }) => { void _p; void _v; return s; })(version) : null;
  return { ok: true, document: result, version: summary, autoApproved };
}

/** The automatic approval a policy asks for right after submit. Recorded as its own audit action. */
async function autoApprove(actor: PbActor, submitted: PbDocumentRecord): Promise<{ doc: PbDocumentRecord; version: PbVersionRecord } | null> {
  const now = new Date();
  const c = await col();
  const after = await c.findOneAndUpdate(
    { _id: submitted._id, deletedAt: null, status: "in_review", rev: submitted.rev } as never,
    {
      $set: {
        status: "approved", updatedAt: now, latestVersion: submitted.versionSeq + 1,
        review: { ...(submitted.review as unknown as Record<string, unknown>), decidedBy: actor.id, decidedAt: now, decision: "auto_approved", reason: null },
      },
      $inc: { rev: 1, versionSeq: 1 },
    } as never,
    { returnDocument: "after" }
  );
  if (!after) return null;
  const version = await freeze(actor, after, "approve", { label: "Approved automatically (author's own document)" });
  await recordPbAudit({ actor, action: "auto_approve", entity: "document", entityId: submitted._id, summary: "Approved automatically", metadata: { version: version.number } });
  return { doc: after, version };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Trash, legal hold, purge
// ---------------------------------------------------------------------------------------------------------------------------------

/** Soft delete: only a draft or archived document that was never issued, and not on legal hold. */
export async function deleteDocument(actor: PbActor, id: string): Promise<PbResult<object>> {
  const l = await load(actor, id, "edit");
  if (!l.ok) return fail(l.error);
  const d = l.doc;
  if (d.status !== "draft" && d.status !== "archived") return fail({ code: "bad_status", message: "Archive the document first; only drafts and archived documents can be deleted.", status: d.status });
  if (d.issuedVersion !== null) return fail({ code: "bad_status", message: "An issued document is kept for the record. It can be archived, and purged by someone with retention rights.", status: d.status });
  if (d.legalHold) return fail({ code: "legal_hold", message: "This document is on legal hold." });
  const lk = blockedByLock(d, actor);
  if (lk) return fail(lk);
  const c = await col();
  const r = await c.updateOne({ _id: id, deletedAt: null, legalHold: false } as never, { $set: { deletedAt: new Date(), deletedBy: actor.id, lock: null } });
  if (!r.modifiedCount) return fail(err.notFound());
  await recordPbAudit({ actor, action: "delete", entity: "document", entityId: id, summary: `Deleted "${d.title}"` });
  return { ok: true };
}

export async function restoreDeletedDocument(actor: PbActor, id: string): Promise<PbResult<object>> {
  const l = await load(actor, id, "edit", true);
  if (!l.ok) return fail(l.error);
  if (!l.doc.deletedAt) return { ok: true };
  const c = await col();
  await c.updateOne({ _id: id } as never, { $set: { deletedAt: null, deletedBy: null } });
  await recordPbAudit({ actor, action: "undelete", entity: "document", entityId: id, summary: `Restored "${l.doc.title}" from the trash` });
  return { ok: true };
}

export async function setLegalHold(actor: PbActor, input: { id: string; hold: boolean; reason?: string }): Promise<PbResult<object>> {
  if (!playbookCan(actor, "MANAGE_RETENTION")) return fail(err.forbidden("place or lift a legal hold"));
  const c = await col();
  const d = await c.findOne({ _id: input.id });
  if (!d) return fail(err.notFound());
  await c.updateOne({ _id: input.id } as never, { $set: { legalHold: input.hold, updatedAt: new Date() } });
  await recordPbAudit({ actor, action: "legal_hold", entity: "document", entityId: input.id, summary: input.hold ? "Placed on legal hold" : "Legal hold lifted", metadata: { reason: cleanText(input.reason, 500) } });
  return { ok: true };
}

/** Permanently removes a document and all its versions. Needs MANAGE_RETENTION; the document must be in the trash or archived, past its retention period, and not on legal hold. */
export async function purgeDocument(actor: PbActor, id: string, opts: { now?: Date } = {}): Promise<PbResult<{ versionsRemoved: number }>> {
  if (!playbookCan(actor, "MANAGE_RETENTION")) return fail(err.forbidden("purge documents"));
  const c = await col();
  const d = await c.findOne({ _id: id });
  if (!d) return fail(err.notFound());
  if (d.legalHold) return fail({ code: "legal_hold", message: "This document is on legal hold. Lift the hold first." });
  if (!d.deletedAt && d.status !== "archived") return fail({ code: "bad_status", message: "Move the document to the trash or archive it first.", status: d.status });
  const months = retentionMonthsFor(await getPbSettings(), d.docTypeId);
  if (months !== null && d.issuedAt) {
    const until = new Date(d.issuedAt);
    until.setMonth(until.getMonth() + months);
    if (until > (opts.now ?? new Date())) return fail({ code: "retention_active", message: `This document must be kept until ${until.toISOString().slice(0, 10)} (the retention period set for its type).`, keepUntil: until.toISOString() });
  }
  const versionsRemoved = await purgeVersionsOfDocument(id);
  await c.deleteOne({ _id: id, legalHold: false } as never);
  await recordPbAudit({
    actor, action: "purge", entity: "document", entityId: id,
    summary: `Purged "${d.title}"${d.docNumber ? ` (${d.docNumber})` : ""}`,
    metadata: { title: d.title, docNumber: d.docNumber, status: d.status, versionsRemoved, lastContentSha256: d.contentSha256 },
  });
  return { ok: true, versionsRemoved };
}

/** Share a document with named people. */
export async function setDocumentAccess(actor: PbActor, input: { id: string; acl: AclEntry[] }): Promise<PbResult<object>> {
  const l = await load(actor, input.id, "edit");
  if (!l.ok) return fail(l.error);
  if (!playbookCan(actor, "SHARE")) return fail(err.forbidden("share documents"));
  const acl = input.acl.filter((a) => typeof a.userId === "string" && a.userId.length <= 64 && (a.level === "view" || a.level === "edit")).slice(0, 100);
  const c = await col();
  await c.updateOne({ _id: input.id } as never, { $set: { acl } });
  return { ok: true };
}

/** The audit trail of one document (needs VIEW_AUDIT). */
export async function getDocumentActivity(actor: PbActor, id: string, page = 1): Promise<PbResult<{ items: PbAuditEntry[]; total: number }>> {
  const l = await load(actor, id, "view", true);
  if (!l.ok) return fail(l.error);
  const r = await listPbAudit(actor, { documentId: id, page });
  return r.ok ? { ok: true, items: r.items, total: r.total } : fail(err.forbidden("view the audit trail"));
}
