import { dlmsEvents } from "@/lib/notify/triggers/dlms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, createStamp, updateStamp, newId, escapeRegex, cleanIsoDate, addDaysIso, todayIso, str, strOrNull, type Stamps } from "@/lib/products/cybervault/db";
import {
  CREDENTIAL_TYPES,
  DOCUMENT_CATEGORIES,
  LINK_TYPES,
  NOTE_TYPES,
  LIMITS,
  STATUSES,
  type ExpiryState,
  type Option,
  type RecordStatus,
  type RecordType,
  type Scope,
} from "@/lib/products/cybervault/constants";
import { encryptSecret, decryptSecret, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/cybervault/crypto";
import { saveDlmsFile, type FileKind } from "@/lib/products/cybervault/files";
import { clientRefs, listClientRefs, userNames } from "@/lib/products/cybervault/access";
import { getSettings } from "@/lib/products/cybervault/settings";
import { recordAudit, diffSummary } from "@/lib/products/cybervault/audit";
import {
  DlmsInputError,
  ForbiddenError,
  can,
  canReadScope,
  canWriteScope,
  scopeFilter,
  type DlmsViewer,
} from "@/lib/products/cybervault/viewer";

/**
 * The four DLMS record types — credentials, documents, URLs/accounts, notes —
 * share one shape (`Base`): every record belongs to the COMPANY or to exactly
 * one CLIENT (a `pms_clients._id`; client details are never copied here).
 * Every read goes through `scopeFilter` and every write through
 * `canWriteScope`, so an employee can only ever touch what they were assigned.
 *
 * Nothing that leaves this module for a list or page carries a secret: rows
 * expose `hasPassword`, never the ciphertext. The only plaintext path is
 * `revealCredential`.
 */

// ── Stored shapes ─────────────────────────────────────────────────────────

interface Base extends Stamps {
  _id: string;
  scope: Scope;
  clientId: string | null;
  name: string;
  category: string;
  status: RecordStatus;
  expiryDate: string | null;
  notes: string | null;
}

export interface CredentialDoc extends Base {
  username: string | null;
  loginUrl: string | null;
  passwordEnc: EncryptedValue | null;
  passwordUpdatedAt: Date | null;
}

export interface DocumentVersion {
  version: number;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: FileKind;
  uploadedBy: string;
  uploadedAt: Date;
  note: string | null;
}

export interface DocumentDoc extends Base {
  description: string | null;
  versions: DocumentVersion[];
  currentVersion: number;
}

export interface LinkDoc extends Base {
  url: string | null;
  account: string | null;
  credentialId: string | null;
}

export interface NoteDoc extends Base {
  body: string;
}

const COLLECTION_OF: Record<RecordType, string> = {
  credential: COLLECTIONS.credentials,
  document: COLLECTIONS.documents,
  link: COLLECTIONS.links,
  note: COLLECTIONS.notes,
};

const CATEGORIES_OF: Record<RecordType, Option[]> = {
  credential: CREDENTIAL_TYPES,
  document: DOCUMENT_CATEGORIES,
  link: LINK_TYPES,
  note: NOTE_TYPES,
};

const AUDIT_ENTITY: Record<RecordType, "credential" | "document" | "link" | "note"> = { credential: "credential", document: "document", link: "link", note: "note" };

const indexed = new Set<string>();
async function getCollection<T extends { _id: string }>(type: RecordType) {
  const db = await getDb();
  const name = COLLECTION_OF[type];
  const col = db.collection<T>(name);
  if (!indexed.has(name)) {
    indexed.add(name);
    await Promise.all([
      col.createIndex({ scope: 1, clientId: 1, deletedAt: 1 }).catch(() => {}),
      col.createIndex({ expiryDate: 1 }).catch(() => {}),
      col.createIndex({ createdAt: -1 }).catch(() => {}),
      col.createIndex({ updatedAt: -1 }).catch(() => {}),
    ]);
  }
  return col;
}

// ── Expiry ────────────────────────────────────────────────────────────────

export function expiryStateOf(date: string | null | undefined, warnDays: number, today = todayIso()): ExpiryState {
  if (!date) return "none";
  if (date < today) return "expired";
  return date <= addDaysIso(today, warnDays) ? "expiring" : "valid";
}

/** Whole days from today to the date (negative when past). */
export function daysUntil(date: string, today = todayIso()): number {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
}

// ── Serialized (client-safe) rows ─────────────────────────────────────────

export interface RowBase {
  id: string;
  scope: Scope;
  clientId: string | null;
  clientName: string | null;
  name: string;
  category: string;
  status: RecordStatus;
  expiryDate: string | null;
  expiry: ExpiryState;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}
export interface CredentialRow extends RowBase {
  username: string | null;
  loginUrl: string | null;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
}
export interface DocumentVersionRow {
  version: number;
  filename: string;
  contentType: string;
  size: number;
  kind: FileKind;
  uploadedAt: string;
  uploadedByName: string | null;
  note: string | null;
}
export interface DocumentRow extends RowBase {
  description: string | null;
  currentVersion: number;
  versions: DocumentVersionRow[];
}
export interface LinkRow extends RowBase {
  url: string | null;
  account: string | null;
  credentialId: string | null;
  credentialName: string | null;
}
export interface NoteRow extends RowBase {
  body: string;
}

interface Names {
  users: Map<string, string>;
  clients: Map<string, { companyName: string; clientCode: string }>;
  warnDays: number;
}

async function loadNames(docs: Base[], extraUserIds: string[] = []): Promise<Names> {
  const userIds = new Set<string>(extraUserIds);
  const clientIds = new Set<string>();
  for (const d of docs) {
    if (d.createdBy) userIds.add(d.createdBy);
    if (d.updatedBy) userIds.add(d.updatedBy);
    if (d.clientId) clientIds.add(d.clientId);
  }
  const [users, clients, settings] = await Promise.all([userNames([...userIds]), clientRefs([...clientIds]), getSettings()]);
  return { users, clients, warnDays: settings.warnDays };
}

function baseRow(d: Base, n: Names): RowBase {
  const c = d.clientId ? n.clients.get(d.clientId) : null;
  return {
    id: d._id,
    scope: d.scope,
    clientId: d.clientId,
    clientName: d.scope === "company" ? null : c ? `${c.companyName}` : "Unknown client",
    name: d.name,
    category: d.category,
    status: d.status,
    expiryDate: d.expiryDate,
    expiry: expiryStateOf(d.expiryDate, n.warnDays),
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    createdByName: d.createdBy ? n.users.get(d.createdBy) ?? null : null,
    updatedByName: d.updatedBy ? n.users.get(d.updatedBy) ?? null : null,
  };
}

// ── Filtering / listing ───────────────────────────────────────────────────

export interface RecordQuery {
  scope?: string;
  clientId?: string;
  category?: string;
  /** "" = active only · "archived" · "all" */
  status?: string;
  expiry?: string;
  q?: string;
  limit?: number;
  sort?: "created" | "updated" | "name" | "expiry";
}

const SEARCH_FIELDS: Record<RecordType, string[]> = {
  credential: ["name", "username", "loginUrl", "notes"],
  document: ["name", "description", "notes", "versions.filename"],
  link: ["name", "url", "account", "notes"],
  note: ["name", "body"],
};

export async function buildFilter(viewer: DlmsViewer, type: RecordType, q: RecordQuery): Promise<Record<string, unknown>> {
  const and: Record<string, unknown>[] = [{ deletedAt: null }, scopeFilter(viewer)];
  if (q.scope === "company") and.push({ scope: "company" });
  else if (q.scope === "client") and.push({ scope: "client" });
  if (q.clientId) and.push({ scope: "client", clientId: q.clientId });
  if (q.category) and.push({ category: q.category });
  if (q.status === "archived") and.push({ status: "archived" });
  else if (q.status !== "all") and.push({ status: "active" });
  if (q.expiry) {
    const settings = await getSettings();
    const today = todayIso();
    const limit = addDaysIso(today, settings.warnDays);
    if (q.expiry === "expired") and.push({ expiryDate: { $lt: today, $ne: null } });
    else if (q.expiry === "expiring") and.push({ expiryDate: { $gte: today, $lte: limit } });
    else if (q.expiry === "valid") and.push({ expiryDate: { $gt: limit } });
    else if (q.expiry === "none") and.push({ expiryDate: null });
    else if (q.expiry === "set") and.push({ expiryDate: { $ne: null } });
  }
  if (q.q?.trim()) {
    const rx = new RegExp(escapeRegex(q.q.trim().slice(0, 100)), "i");
    and.push({ $or: SEARCH_FIELDS[type].map((f) => ({ [f]: rx })) });
  }
  return { $and: and };
}

function sortOf(sort: RecordQuery["sort"]): Record<string, 1 | -1> {
  if (sort === "updated") return { updatedAt: -1 };
  if (sort === "name") return { name: 1 };
  if (sort === "expiry") return { expiryDate: 1, name: 1 };
  return { createdAt: -1 };
}

async function findDocs<T extends Base>(viewer: DlmsViewer, type: RecordType, q: RecordQuery): Promise<T[]> {
  const col = await getCollection<T & { _id: string }>(type);
  const filter = await buildFilter(viewer, type, q);
  return col
    .find(filter as never)
    .sort(sortOf(q.sort) as never)
    .limit(Math.min(q.limit ?? LIMITS.pageSize, LIMITS.pageSize))
    .toArray() as Promise<T[]>;
}

export async function countRecords(viewer: DlmsViewer, type: RecordType, q: RecordQuery): Promise<number> {
  const col = await getCollection<Base>(type);
  return col.countDocuments((await buildFilter(viewer, type, q)) as never);
}

function credentialRow(d: CredentialDoc, n: Names): CredentialRow {
  return {
    ...baseRow(d, n),
    username: d.username,
    loginUrl: d.loginUrl,
    hasPassword: Boolean(d.passwordEnc),
    passwordUpdatedAt: d.passwordUpdatedAt ? d.passwordUpdatedAt.toISOString() : null,
  };
}

function documentRow(d: DocumentDoc, n: Names): DocumentRow {
  return {
    ...baseRow(d, n),
    description: d.description,
    currentVersion: d.currentVersion,
    versions: [...d.versions]
      .sort((a, b) => b.version - a.version)
      .map((v) => ({
        version: v.version,
        filename: v.filename,
        contentType: v.contentType,
        size: v.size,
        kind: v.kind,
        uploadedAt: v.uploadedAt.toISOString(),
        uploadedByName: n.users.get(v.uploadedBy) ?? null,
        note: v.note,
      })),
  };
}

export async function listCredentials(viewer: DlmsViewer, q: RecordQuery = {}): Promise<CredentialRow[]> {
  const docs = await findDocs<CredentialDoc>(viewer, "credential", q);
  const n = await loadNames(docs);
  return docs.map((d) => credentialRow(d, n));
}

export async function listDocuments(viewer: DlmsViewer, q: RecordQuery = {}): Promise<DocumentRow[]> {
  const docs = await findDocs<DocumentDoc>(viewer, "document", q);
  const n = await loadNames(docs, docs.flatMap((d) => d.versions.map((v) => v.uploadedBy)));
  return docs.map((d) => documentRow(d, n));
}

export async function listLinks(viewer: DlmsViewer, q: RecordQuery = {}): Promise<LinkRow[]> {
  const docs = await findDocs<LinkDoc>(viewer, "link", q);
  const n = await loadNames(docs);
  const credIds = [...new Set(docs.map((d) => d.credentialId).filter((x): x is string => Boolean(x)))];
  const credNames = new Map<string, string>();
  if (credIds.length > 0) {
    const col = await getCollection<CredentialDoc>("credential");
    // The linked credential's NAME is only shown if the viewer may see that credential too.
    const visible = await col.find({ $and: [{ _id: { $in: credIds } }, { deletedAt: null }, scopeFilter(viewer)] } as never, { projection: { name: 1 } }).toArray();
    for (const c of visible) credNames.set(c._id, c.name);
  }
  return docs.map((d) => ({ ...baseRow(d, n), url: d.url, account: d.account, credentialId: d.credentialId, credentialName: d.credentialId ? credNames.get(d.credentialId) ?? null : null }));
}

export async function listNotes(viewer: DlmsViewer, q: RecordQuery = {}): Promise<NoteRow[]> {
  const docs = await findDocs<NoteDoc>(viewer, "note", q);
  const n = await loadNames(docs);
  return docs.map((d) => ({ ...baseRow(d, n), body: d.body }));
}

/** A type-agnostic row for mixed feeds (dashboard "recent", expiry board). */
export interface FeedItem {
  type: RecordType;
  id: string;
  name: string;
  category: string;
  scope: Scope;
  clientId: string | null;
  clientName: string | null;
  status: RecordStatus;
  expiryDate: string | null;
  expiry: ExpiryState;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

export async function feedItems(viewer: DlmsViewer, type: RecordType, q: RecordQuery): Promise<FeedItem[]> {
  const docs = await findDocs<Base>(viewer, type, q);
  const n = await loadNames(docs);
  return docs.map((d) => {
    const r = baseRow(d, n);
    return { type, id: r.id, name: r.name, category: r.category, scope: r.scope, clientId: r.clientId, clientName: r.clientName, status: r.status, expiryDate: r.expiryDate, expiry: r.expiry, createdAt: r.createdAt, updatedAt: r.updatedAt, createdByName: r.createdByName, updatedByName: r.updatedByName };
  });
}

/** Lightweight picker list of credentials the viewer can see (for linking a URL/account to a credential). */
export async function credentialOptions(viewer: DlmsViewer): Promise<{ id: string; name: string; scope: Scope; clientId: string | null }[]> {
  const col = await getCollection<CredentialDoc>("credential");
  const docs = await col.find({ $and: [{ deletedAt: null }, { status: "active" }, scopeFilter(viewer)] } as never, { projection: { name: 1, scope: 1, clientId: 1 } }).sort({ name: 1 }).limit(500).toArray();
  return docs.map((d) => ({ id: d._id, name: d.name, scope: d.scope, clientId: d.clientId }));
}

async function loadScoped<T extends Base>(viewer: DlmsViewer, type: RecordType, id: string): Promise<T | null> {
  const col = await getCollection<T & { _id: string }>(type);
  const doc = (await col.findOne({ _id: id, deletedAt: null } as never)) as T | null;
  if (!doc || !can(viewer, "VIEW") || !canReadScope(viewer, doc.scope, doc.clientId)) return null;
  return doc;
}

export async function getDocumentDoc(viewer: DlmsViewer, id: string): Promise<DocumentDoc | null> {
  return loadScoped<DocumentDoc>(viewer, "document", id);
}

// ── Input parsing ─────────────────────────────────────────────────────────

type Input = Record<string, unknown>;

async function resolveTarget(viewer: DlmsViewer, input: Input, existing?: Base): Promise<{ scope: Scope; clientId: string | null }> {
  const scope: Scope = input.scope === "client" ? "client" : "company";
  let clientId: string | null = null;
  if (scope === "client") {
    clientId = str(input.clientId, 80) || null;
    if (!clientId) throw new DlmsInputError("Choose the client this record belongs to.");
    const known = (await listClientRefs()).some((c) => c._id === clientId);
    if (!known) throw new DlmsInputError("That client does not exist in the client master.");
  }
  if (!canWriteScope(viewer, scope, clientId)) throw new ForbiddenError(scope === "company" ? "MANAGE_COMPANY" : "MANAGE_CLIENTS");
  if (existing && !canWriteScope(viewer, existing.scope, existing.clientId)) throw new ForbiddenError();
  return { scope, clientId };
}

function parseBase(type: RecordType, input: Input): { name: string; category: string; status: RecordStatus; expiryDate: string | null; notes: string | null } {
  const name = str(input.name, LIMITS.name);
  if (!name) throw new DlmsInputError("Give the record a name.");
  const categories = CATEGORIES_OF[type];
  const category = str(input.category, 40);
  if (!categories.some((c) => c.value === category)) throw new DlmsInputError("Choose a valid category / type.");
  const status = (STATUSES as readonly string[]).includes(String(input.status)) ? (input.status as RecordStatus) : "active";
  const rawExpiry = str(input.expiryDate, 10);
  const expiryDate = rawExpiry ? cleanIsoDate(rawExpiry) : null;
  if (rawExpiry && !expiryDate) throw new DlmsInputError("That expiry date is not valid.");
  return { name, category, status, expiryDate, notes: strOrNull(input.notes, LIMITS.text) };
}

function cleanUrl(v: unknown, label: string): string | null {
  const raw = str(v, 500);
  if (!raw) return null;
  // Stored and rendered as a link, so only http(s) is allowed — never javascript:/data:.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new DlmsInputError(`${label} is not a valid http(s) URL.`);
  }
}

const label = (d: Base) => `${d.name}`;

// ── Credentials ───────────────────────────────────────────────────────────

const CRED_DIFF = ["name", "category", "status", "scope", "clientId", "username", "loginUrl", "expiryDate"];

export async function createCredential(viewer: DlmsViewer, input: Input): Promise<string> {
  const target = await resolveTarget(viewer, input);
  const base = parseBase("credential", input);
  const password = typeof input.password === "string" ? input.password.slice(0, LIMITS.secret) : "";
  if (password && !isEncryptionConfigured()) throw new DlmsInputError("PLATFORM_ENCRYPTION_KEY is not configured — passwords cannot be stored yet. Ask an admin to set it.");
  const id = newId();
  const doc: CredentialDoc = {
    _id: id,
    ...target,
    ...base,
    username: strOrNull(input.username, 200),
    loginUrl: cleanUrl(input.loginUrl, "Login URL"),
    passwordEnc: password ? encryptSecret(password, id) : null,
    passwordUpdatedAt: password ? new Date() : null,
    ...createStamp(viewer.userId),
  };
  await (await getCollection<CredentialDoc>("credential")).insertOne(doc);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "credential", entityId: id, entityLabel: label(doc), scope: doc.scope, clientId: doc.clientId, summary: `Created credential "${doc.name}"${password ? " (password stored)" : ""}` });
  await dlmsEvents.added("credential", id, doc.name, viewer.userId);
  return id;
}

export async function updateCredential(viewer: DlmsViewer, id: string, input: Input): Promise<void> {
  const existing = await loadScoped<CredentialDoc>(viewer, "credential", id);
  if (!existing) throw new DlmsInputError("That credential no longer exists.");
  const target = await resolveTarget(viewer, input, existing);
  const base = parseBase("credential", input);
  const password = typeof input.password === "string" ? input.password.slice(0, LIMITS.secret) : "";
  if (password && !isEncryptionConfigured()) throw new DlmsInputError("PLATFORM_ENCRYPTION_KEY is not configured — passwords cannot be stored yet.");
  const patch: Record<string, unknown> = {
    ...target,
    ...base,
    username: strOrNull(input.username, 200),
    loginUrl: cleanUrl(input.loginUrl, "Login URL"),
    ...updateStamp(viewer.userId),
  };
  if (password) {
    patch.passwordEnc = encryptSecret(password, id);
    patch.passwordUpdatedAt = new Date();
  } else if (input.clearPassword === true) {
    patch.passwordEnc = null;
    patch.passwordUpdatedAt = null;
  }
  await (await getCollection<CredentialDoc>("credential")).updateOne({ _id: id }, { $set: patch });
  const changes = diffSummary(existing as never, { ...existing, ...patch } as never, CRED_DIFF);
  const pw = password ? "password changed" : input.clearPassword === true ? "password removed" : null;
  await recordAudit({
    actorId: viewer.userId,
    actorEmail: viewer.email,
    action: "update",
    entity: "credential",
    entityId: id,
    entityLabel: base.name,
    scope: target.scope,
    clientId: target.clientId,
    summary: [changes, pw].filter(Boolean).join("; ") || "Saved with no changes",
  });
}

/**
 * The ONE place a stored secret is decrypted. Requires REVEAL and scope
 * access, is logged (who/what/when — never the value), and returns the
 * plaintext to the caller only.
 */
export async function revealCredential(viewer: DlmsViewer, id: string, purpose: "reveal" | "copy"): Promise<string> {
  if (!can(viewer, "REVEAL")) throw new ForbiddenError("REVEAL");
  const doc = await loadScoped<CredentialDoc>(viewer, "credential", id);
  if (!doc) throw new DlmsInputError("That credential no longer exists.");
  if (!doc.passwordEnc) throw new DlmsInputError("No password is stored for this credential.");
  if (!isEncryptionConfigured()) throw new DlmsInputError("PLATFORM_ENCRYPTION_KEY is not configured.");
  const plain = decryptSecret(doc.passwordEnc, id);
  if (plain === null) throw new DlmsInputError("The stored password could not be decrypted. Check the encryption key.");
  await recordAudit({
    actorId: viewer.userId,
    actorEmail: viewer.email,
    action: purpose,
    entity: "credential",
    entityId: id,
    entityLabel: label(doc),
    scope: doc.scope,
    clientId: doc.clientId,
    summary: purpose === "copy" ? `Copied the password of "${doc.name}"` : `Revealed the password of "${doc.name}"`,
  });
  await dlmsEvents.revealed(id, doc.name, purpose, viewer.userId, viewer.email);
  return plain;
}

// ── Documents ─────────────────────────────────────────────────────────────

const DOC_DIFF = ["name", "category", "status", "scope", "clientId", "description", "expiryDate"];

function toVersion(stored: Awaited<ReturnType<typeof saveDlmsFile>> & { ok: true }, version: number, actorId: string, note: string | null): DocumentVersion {
  return { version, ...stored.stored, uploadedBy: actorId, uploadedAt: new Date(), note };
}

export async function createDocument(viewer: DlmsViewer, input: Input, file: File | null): Promise<string> {
  if (!file || file.size === 0) throw new DlmsInputError("Choose a file to upload.");
  const target = await resolveTarget(viewer, input);
  const base = parseBase("document", input);
  const saved = await saveDlmsFile(file);
  if (!saved.ok) throw new DlmsInputError(saved.error);
  const id = newId();
  const doc: DocumentDoc = {
    _id: id,
    ...target,
    ...base,
    description: strOrNull(input.description, LIMITS.text),
    versions: [toVersion(saved, 1, viewer.userId, null)],
    currentVersion: 1,
    ...createStamp(viewer.userId),
  };
  await (await getCollection<DocumentDoc>("document")).insertOne(doc);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "upload", entity: "document", entityId: id, entityLabel: label(doc), scope: doc.scope, clientId: doc.clientId, summary: `Uploaded "${doc.name}" (${saved.stored.filename})` });
  await dlmsEvents.added("document", id, doc.name, viewer.userId);
  return id;
}

export async function updateDocument(viewer: DlmsViewer, id: string, input: Input): Promise<void> {
  const existing = await loadScoped<DocumentDoc>(viewer, "document", id);
  if (!existing) throw new DlmsInputError("That document no longer exists.");
  const target = await resolveTarget(viewer, input, existing);
  const base = parseBase("document", input);
  const patch = { ...target, ...base, description: strOrNull(input.description, LIMITS.text), ...updateStamp(viewer.userId) };
  await (await getCollection<DocumentDoc>("document")).updateOne({ _id: id }, { $set: patch });
  await recordAudit({
    actorId: viewer.userId,
    actorEmail: viewer.email,
    action: "update",
    entity: "document",
    entityId: id,
    entityLabel: base.name,
    scope: target.scope,
    clientId: target.clientId,
    summary: diffSummary(existing as never, { ...existing, ...patch } as never, DOC_DIFF) ?? "Saved with no changes",
  });
}

/** Adds a new version (the previous ones stay downloadable). */
export async function addDocumentVersion(viewer: DlmsViewer, id: string, file: File | null, note: string): Promise<number> {
  if (!file || file.size === 0) throw new DlmsInputError("Choose the new file.");
  const existing = await loadScoped<DocumentDoc>(viewer, "document", id);
  if (!existing) throw new DlmsInputError("That document no longer exists.");
  if (!canWriteScope(viewer, existing.scope, existing.clientId)) throw new ForbiddenError();
  const saved = await saveDlmsFile(file);
  if (!saved.ok) throw new DlmsInputError(saved.error);
  const version = existing.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  // Guarded on currentVersion so two simultaneous replaces can't both claim the same number.
  const res = await (await getCollection<DocumentDoc>("document")).updateOne(
    { _id: id, currentVersion: existing.currentVersion },
    { $push: { versions: toVersion(saved, version, viewer.userId, strOrNull(note, 300)) }, $set: { currentVersion: version, ...updateStamp(viewer.userId) } }
  );
  if (res.modifiedCount === 0) throw new DlmsInputError("Someone else just updated this document — reload and try again.");
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "replace", entity: "document", entityId: id, entityLabel: label(existing), scope: existing.scope, clientId: existing.clientId, summary: `Uploaded version ${version} of "${existing.name}" (${saved.stored.filename})` });
  return version;
}

// ── URLs & accounts ───────────────────────────────────────────────────────

const LINK_DIFF = ["name", "category", "status", "scope", "clientId", "url", "account", "credentialId", "expiryDate"];

async function parseLink(viewer: DlmsViewer, input: Input, target: { scope: Scope; clientId: string | null }) {
  const credentialId = strOrNull(input.credentialId, 80);
  if (credentialId) {
    const cred = await loadScoped<CredentialDoc>(viewer, "credential", credentialId);
    if (!cred || cred.scope !== target.scope || cred.clientId !== target.clientId) throw new DlmsInputError("The related credential must belong to the same company/client.");
  }
  return { url: cleanUrl(input.url, "URL"), account: strOrNull(input.account, 200), credentialId };
}

export async function createLink(viewer: DlmsViewer, input: Input): Promise<string> {
  const target = await resolveTarget(viewer, input);
  const base = parseBase("link", input);
  const extra = await parseLink(viewer, input, target);
  const id = newId();
  const doc: LinkDoc = { _id: id, ...target, ...base, ...extra, ...createStamp(viewer.userId) };
  await (await getCollection<LinkDoc>("link")).insertOne(doc);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "link", entityId: id, entityLabel: label(doc), scope: doc.scope, clientId: doc.clientId, summary: `Created URL/account "${doc.name}"` });
  return id;
}

export async function updateLink(viewer: DlmsViewer, id: string, input: Input): Promise<void> {
  const existing = await loadScoped<LinkDoc>(viewer, "link", id);
  if (!existing) throw new DlmsInputError("That record no longer exists.");
  const target = await resolveTarget(viewer, input, existing);
  const base = parseBase("link", input);
  const extra = await parseLink(viewer, input, target);
  const patch = { ...target, ...base, ...extra, ...updateStamp(viewer.userId) };
  await (await getCollection<LinkDoc>("link")).updateOne({ _id: id }, { $set: patch });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "link", entityId: id, entityLabel: base.name, scope: target.scope, clientId: target.clientId, summary: diffSummary(existing as never, { ...existing, ...patch } as never, LINK_DIFF) ?? "Saved with no changes" });
}

// ── Notes ─────────────────────────────────────────────────────────────────

export async function createNote(viewer: DlmsViewer, input: Input): Promise<string> {
  const target = await resolveTarget(viewer, input);
  const base = parseBase("note", { ...input, status: input.status, expiryDate: "" });
  const body = str(input.body, LIMITS.note);
  if (!body) throw new DlmsInputError("Write the note.");
  const id = newId();
  const doc: NoteDoc = { _id: id, ...target, ...base, notes: null, body, ...createStamp(viewer.userId) };
  await (await getCollection<NoteDoc>("note")).insertOne(doc);
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "note", entityId: id, entityLabel: label(doc), scope: doc.scope, clientId: doc.clientId, summary: `Created note "${doc.name}"` });
  return id;
}

export async function updateNote(viewer: DlmsViewer, id: string, input: Input): Promise<void> {
  const existing = await loadScoped<NoteDoc>(viewer, "note", id);
  if (!existing) throw new DlmsInputError("That note no longer exists.");
  const target = await resolveTarget(viewer, input, existing);
  const base = parseBase("note", { ...input, expiryDate: "" });
  const body = str(input.body, LIMITS.note);
  if (!body) throw new DlmsInputError("Write the note.");
  await (await getCollection<NoteDoc>("note")).updateOne({ _id: id }, { $set: { ...target, ...base, notes: null, body, ...updateStamp(viewer.userId) } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "note", entityId: id, entityLabel: base.name, scope: target.scope, clientId: target.clientId, summary: `Edited note "${base.name}"` });
}

// ── Shared: archive / restore / delete ────────────────────────────────────

export async function setRecordStatus(viewer: DlmsViewer, type: RecordType, id: string, status: RecordStatus): Promise<void> {
  const existing = await loadScoped<Base>(viewer, type, id);
  if (!existing) throw new DlmsInputError("That record no longer exists.");
  if (!canWriteScope(viewer, existing.scope, existing.clientId)) throw new ForbiddenError();
  await (await getCollection<Base>(type)).updateOne({ _id: id }, { $set: { status, ...updateStamp(viewer.userId) } });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: status === "archived" ? "archive" : "restore", entity: AUDIT_ENTITY[type], entityId: id, entityLabel: label(existing), scope: existing.scope, clientId: existing.clientId, summary: `${status === "archived" ? "Archived" : "Restored"} "${existing.name}"` });
  await dlmsEvents.archived(type, id, existing.name, status === "archived", viewer.userId);
}

/** Soft delete: the row (and any stored file) is kept but disappears everywhere, and the deletion is logged. */
export async function deleteRecord(viewer: DlmsViewer, type: RecordType, id: string): Promise<void> {
  const existing = await loadScoped<Base>(viewer, type, id);
  if (!existing) throw new DlmsInputError("That record no longer exists.");
  if (!canWriteScope(viewer, existing.scope, existing.clientId)) throw new ForbiddenError();
  await (await getCollection<Base>(type)).updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(viewer.userId) } });
  if (type === "credential") {
    // A URL/account that pointed at this credential must not keep a dangling reference.
    await (await getCollection<LinkDoc>("link")).updateMany({ credentialId: id }, { $set: { credentialId: null } });
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "delete", entity: AUDIT_ENTITY[type], entityId: id, entityLabel: label(existing), scope: existing.scope, clientId: existing.clientId, summary: `Deleted "${existing.name}"` });
  await dlmsEvents.deleted(type, id, existing.name, viewer.userId, viewer.email);
}
