import "server-only";
import { randomUUID } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { cfParties } from "./cf-db";
import { PARTY_ADAPTERS, escapeRegex, type SourceRecord } from "./party-adapters";
import { MANUAL_PARTY_TYPES, PARTY_TYPES, isLinkedType, isPartyType, type PartyDoc, type PartyType, type PartyView, type PickerHit } from "./party-types";
import type { LpmsViewer } from "./types";

/**
 * The party service. A linked party stores only a reference; its name, email and phone are read from the system of record every time, and a
 * source that was deleted is reported as `source_missing` (the last name seen is still shown, nothing else). Every function checks the
 * viewer against the party type first, so an employee or candidate is only ever visible to HR (and ContractFlow admins).
 */

export class PartyError extends Error {
  constructor(message: string, readonly code: "forbidden" | "invalid" | "not_found" | "source_missing") {
    super(message);
    this.name = "PartyError";
  }
}

const ctx = (v: LpmsViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });

/** Whether the viewer may see parties of this type at all. */
export function canAccessPartyType(v: LpmsViewer, type: PartyType): boolean {
  if (isLinkedType(type)) return PARTY_ADAPTERS[type].canAccess(v);
  return lpmsCan(ctx(v), "VIEW") || lpmsCan(ctx(v), "MANAGE_DOCUMENTS");
}
export function visiblePartyTypes(v: LpmsViewer): PartyType[] {
  return PARTY_TYPES.filter((t) => canAccessPartyType(v, t));
}
const canCreateManual = (v: LpmsViewer) => lpmsCan(ctx(v), "CREATE") || lpmsCan(ctx(v), "SIGN") || lpmsCan(ctx(v), "MANAGE_DOCUMENTS");

const searchKeyOf = (name: string, extra = "") => `${name} ${extra}`.toLowerCase().replace(/\s+/g, " ").trim();
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function viewOf(p: PartyDoc, live: SourceRecord | null): PartyView {
  const linked = p.source !== null;
  const missing = linked && live === null;
  return {
    id: p._id,
    type: p.type,
    displayName: live?.displayName ?? p.displayName,
    status: p.status,
    linked,
    source: p.source,
    email: linked ? (live?.email ?? null) : (p.contact?.email ?? null),
    phone: linked ? (live?.phone ?? null) : (p.contact?.phone ?? null),
    subtitle: live?.subtitle ?? null,
    sourceMissing: missing,
  };
}

/** Picker: records of one type matching the text. Linked types search the source product; manual types search the index. */
export async function searchParties(v: LpmsViewer, input: { type: PartyType; q?: string; limit?: number }): Promise<PickerHit[]> {
  if (!isPartyType(input.type)) throw new PartyError("Unknown party type.", "invalid");
  if (!canAccessPartyType(v, input.type)) throw new PartyError("You do not have access to this kind of party.", "forbidden");
  const q = clean(input.q, 80);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const col = await cfParties();
  if (isLinkedType(input.type)) {
    const adapter = PARTY_ADAPTERS[input.type];
    const found = await adapter.search(q, limit);
    const indexed = found.length ? await col.find({ "source.collection": adapter.ref.collection, "source.id": { $in: found.map((f) => f.id) } }).toArray() : [];
    const byId = new Map(indexed.map((p) => [p.source!.id, p._id]));
    return found.map((f) => ({ type: input.type, recordId: f.id, displayName: f.displayName, subtitle: f.subtitle, partyId: byId.get(f.id) ?? null }));
  }
  const rows = await col.find({ type: input.type, status: { $ne: "archived" }, ...(q ? { searchKey: { $regex: escapeRegex(q.toLowerCase()) } } : {}) }).sort({ searchKey: 1 }).limit(limit).toArray();
  return rows.map((p) => ({ type: p.type, recordId: p._id, displayName: p.displayName, subtitle: p.contact?.email ?? null, partyId: p._id }));
}

/** Links a record of another product into the index. Linking the same record twice returns the same party. */
export async function linkParty(v: LpmsViewer, input: { type: PartyType; recordId: string }): Promise<PartyView> {
  if (!isPartyType(input.type) || !isLinkedType(input.type)) throw new PartyError("Only clients, vendors, employees and candidates are linked to another product.", "invalid");
  if (!canAccessPartyType(v, input.type)) throw new PartyError("You do not have access to this kind of party.", "forbidden");
  const adapter = PARTY_ADAPTERS[input.type];
  const recordId = clean(input.recordId, 64);
  const rec = recordId ? await adapter.resolve(recordId) : null;
  if (!rec) throw new PartyError("That record does not exist (or was deleted).", "not_found");
  const col = await cfParties();
  const now = new Date();
  const ref = { ...adapter.ref, id: rec.id };
  const existing = await col.findOne({ "source.collection": ref.collection, "source.id": ref.id });
  if (existing) {
    await col.updateOne({ _id: existing._id }, { $set: { displayName: rec.displayName, searchKey: searchKeyOf(rec.displayName, rec.subtitle ?? ""), status: "active", lastResolvedAt: now, updatedAt: now } });
    return viewOf({ ...existing, displayName: rec.displayName, status: "active" }, rec);
  }
  const doc: PartyDoc = {
    _id: randomUUID(),
    type: input.type,
    source: ref,
    displayName: rec.displayName,
    contact: null,
    status: "active",
    searchKey: searchKeyOf(rec.displayName, rec.subtitle ?? ""),
    createdBy: v.userId,
    createdAt: now,
    updatedAt: now,
    lastResolvedAt: now,
  };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const raced = await col.findOne({ "source.collection": ref.collection, "source.id": ref.id });
    if (raced) return viewOf(raced, rec);
    throw err;
  }
  return viewOf(doc, rec);
}

/** A partner, freelancer, trainee or other party that has no record in another product. */
export async function createManualParty(v: LpmsViewer, input: { type: PartyType; name: string; email?: string; phone?: string }): Promise<PartyView> {
  if (!isPartyType(input.type) || !(MANUAL_PARTY_TYPES as readonly string[]).includes(input.type)) throw new PartyError("This kind of party comes from another product; link it instead.", "invalid");
  if (!canCreateManual(v)) throw new PartyError("You may not add parties.", "forbidden");
  const name = clean(input.name, 160);
  if (name.length < 2) throw new PartyError("Enter the party's name.", "invalid");
  const email = clean(input.email, 200).toLowerCase() || null;
  if (email && !EMAIL.test(email)) throw new PartyError("The email address is not valid.", "invalid");
  const phone = clean(input.phone, 30) || null;
  if (phone && !/^[+0-9][0-9 \-()]{6,28}$/.test(phone)) throw new PartyError("The phone number is not valid.", "invalid");
  const now = new Date();
  const doc: PartyDoc = { _id: randomUUID(), type: input.type, source: null, displayName: name, contact: { email, phone }, status: "active", searchKey: searchKeyOf(name, email ?? ""), createdBy: v.userId, createdAt: now, updatedAt: now, lastResolvedAt: null };
  await (await cfParties()).insertOne(doc);
  return viewOf(doc, null);
}

/** One party as it is now. A linked party whose source is gone comes back with `sourceMissing` and is marked so in the index. */
export async function getParty(v: LpmsViewer, partyId: string): Promise<PartyView> {
  const col = await cfParties();
  const p = typeof partyId === "string" && partyId.length <= 64 ? await col.findOne({ _id: partyId }) : null;
  if (!p) throw new PartyError("Party not found.", "not_found");
  if (!canAccessPartyType(v, p.type)) throw new PartyError("You do not have access to this kind of party.", "forbidden");
  if (!p.source) return viewOf(p, null);
  const live = await PARTY_ADAPTERS[p.type as keyof typeof PARTY_ADAPTERS].resolve(p.source.id);
  const next = live ? "active" : p.status === "archived" ? "archived" : "source_missing";
  if (next !== p.status || (live && live.displayName !== p.displayName)) {
    await col.updateOne({ _id: p._id }, { $set: { status: next, ...(live ? { displayName: live.displayName, lastResolvedAt: new Date() } : {}), updatedAt: new Date() } });
  }
  return viewOf({ ...p, status: next }, live);
}

/** The parties the viewer may see, newest first. Names of linked parties are the last ones seen (no per-row lookup); use getParty for live data. */
export async function listParties(v: LpmsViewer, input: { type?: PartyType; q?: string; includeMissing?: boolean; limit?: number } = {}): Promise<PartyView[]> {
  const types = input.type ? (canAccessPartyType(v, input.type) ? [input.type] : []) : visiblePartyTypes(v);
  if (types.length === 0) return [];
  const q = clean(input.q, 80).toLowerCase();
  const rows = await (await cfParties())
    .find({ type: { $in: types }, status: input.includeMissing ? { $ne: "archived" } : "active", ...(q ? { searchKey: { $regex: escapeRegex(q) } } : {}) })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200))
    .toArray();
  return rows.map((p) => viewOf(p, p.source ? ({ id: p.source.id, displayName: p.displayName, email: null, phone: null, subtitle: null } satisfies SourceRecord) : null)).map((x) => ({ ...x, sourceMissing: x.status === "source_missing" }));
}

export async function archiveParty(v: LpmsViewer, partyId: string): Promise<void> {
  const col = await cfParties();
  const p = await col.findOne({ _id: partyId });
  if (!p) throw new PartyError("Party not found.", "not_found");
  if (!canAccessPartyType(v, p.type) || !canCreateManual(v)) throw new PartyError("You may not archive this party.", "forbidden");
  await col.updateOne({ _id: p._id }, { $set: { status: "archived", updatedAt: new Date() } });
}
