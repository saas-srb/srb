import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { STAMP_RULEBOOK_COLLECTION } from "@/lib/products/contractflow-ai/cf-collections";
import {
  JURISDICTIONS,
  contentOf,
  entryStatus,
  jurisdictionByCode,
  snapshotOf,
  validateDraft,
  validateForConfirm,
  type EntryStatus,
  type Jurisdiction,
  type StampEntry,
  type StampEntryContent,
} from "./structure";

/**
 * The platform's stamp-duty rulebook (`stamp_rulebook`, one document per state or union territory, `_id` = the code such as "MH").
 * Global collection: every company reads the same table. A jurisdiction with no document is "structure only": it exists in the list with no
 * entries. Nothing here is ever authoritative; see `guidance.ts` for how the table is read.
 */

export type HistoryAction = "save" | "remove" | "confirm" | "unconfirm" | "copy";

interface Doc {
  _id: string;
  entries: StampEntry[];
  version: number;
  updatedAt: Date;
  updatedBy: string;
  history: { at: Date; by: string; action: HistoryAction; entryId: string | null; detail: string }[];
}

export interface Actor {
  id: string;
  email: string;
}

export type StoreResult<T extends object = object> = ({ ok: true } & T) | { ok: false; errors: string[]; conflict?: boolean };

const col = async () => (await getPlatformDb()).collection<Doc>(STAMP_RULEBOOK_COLLECTION);
const HISTORY_CAP = 300;

export interface LoadedJurisdiction {
  jurisdiction: Jurisdiction;
  origin: "structure_only" | "published";
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  entries: (StampEntry & { status: EntryStatus })[];
}

const withStatus = (e: StampEntry) => ({ ...e, status: entryStatus(e) });

function toLoaded(j: Jurisdiction, d: Doc | null): LoadedJurisdiction {
  return {
    jurisdiction: j,
    origin: d ? "published" : "structure_only",
    version: d?.version ?? 0,
    updatedAt: d?.updatedAt.toISOString() ?? null,
    updatedBy: d?.updatedBy ?? null,
    entries: (d?.entries ?? []).map(withStatus),
  };
}

export async function loadJurisdiction(code: string): Promise<LoadedJurisdiction | null> {
  const j = jurisdictionByCode(code);
  if (!j) return null;
  return toLoaded(j, await (await col()).findOne({ _id: code }));
}

export interface JurisdictionSummary {
  jurisdiction: Jurisdiction;
  entries: number;
  confirmed: number;
  notEntered: number;
  version: number;
}

/** Every state and UT, whether or not anything was entered for it. */
export async function listJurisdictions(): Promise<JurisdictionSummary[]> {
  const docs = await (await col()).find({}).toArray();
  const byCode = new Map(docs.map((d) => [d._id, d]));
  return JURISDICTIONS.map((j) => {
    const d = byCode.get(j.code);
    const entries = d?.entries ?? [];
    return {
      jurisdiction: j,
      entries: entries.length,
      confirmed: entries.filter((e) => entryStatus(e) === "confirmed").length,
      notEntered: entries.filter((e) => e.dutyType === "not_entered").length,
      version: d?.version ?? 0,
    };
  });
}

const CONFLICT: StoreResult = { ok: false, conflict: true, errors: ["Someone else changed this state while you were editing. Reload and try again."] };

/** Writes a changed document with an optimistic version check. */
async function commit(code: string, base: Doc | null, next: Doc): Promise<boolean> {
  const c = await col();
  next.version = (base?.version ?? 0) + 1;
  next.history = next.history.slice(-HISTORY_CAP);
  if (!base) {
    try {
      await c.insertOne(next);
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }
  const r = await c.replaceOne({ _id: code, version: base.version }, next);
  return r.matchedCount === 1;
}

const fresh = (code: string): Doc => ({ _id: code, entries: [], version: 0, updatedAt: new Date(), updatedBy: "", history: [] });

async function mutate(
  code: string,
  expectedVersion: number,
  actor: Actor,
  audit: string,
  fn: (doc: Doc) => StoreResult | null,
): Promise<StoreResult> {
  if (!jurisdictionByCode(code)) return { ok: false, errors: ["That state or union territory is not in the list."] };
  const base = await (await col()).findOne({ _id: code });
  if ((base?.version ?? 0) !== expectedVersion) return CONFLICT;
  const next: Doc = base ? structuredClone(base) : fresh(code);
  const failure = fn(next);
  if (failure) return failure;
  next.updatedAt = new Date();
  next.updatedBy = actor.email;
  if (!(await commit(code, base, next))) return CONFLICT;
  await recordPlatformAudit({ actorId: actor.id, action: audit, target: { type: STAMP_RULEBOOK_COLLECTION, id: code }, details: { version: next.version } });
  return { ok: true };
}

const hist = (doc: Doc, actor: Actor, action: HistoryAction, entryId: string | null, detail: string) => doc.history.push({ at: new Date(), by: actor.email, action, entryId, detail });

/** Adds an entry (no id) or changes one. Changing the content of a confirmed entry removes its confirmation. */
export async function saveEntry(code: string, entryId: string | null, content: StampEntryContent, expectedVersion: number, actor: Actor): Promise<StoreResult<{ entryId: string }>> {
  const clean = contentOf(content);
  const errs = validateDraft(clean);
  if (errs.length) return { ok: false, errors: errs };
  const savedId = entryId ?? randomUUID();
  const r = await mutate(code, expectedVersion, actor, "stamp.rulebook.save", (doc) => {
    const at = new Date().toISOString();
    const i = entryId ? doc.entries.findIndex((e) => e.id === entryId) : -1;
    if (entryId && i < 0) return { ok: false, errors: ["That entry no longer exists."] };
    if (i >= 0) {
      const old = doc.entries[i];
      const unchanged = snapshotOf(old) === snapshotOf(clean);
      doc.entries[i] = { ...clean, id: old.id, confirmation: unchanged ? old.confirmation : null, updatedBy: actor.email, updatedAt: at };
      hist(doc, actor, "save", old.id, unchanged ? "saved without changes" : old.confirmation ? "changed; confirmation removed" : "changed");
    } else {
      doc.entries.push({ ...clean, id: savedId, confirmation: null, updatedBy: actor.email, updatedAt: at });
      hist(doc, actor, "save", savedId, `added ${clean.category}`);
    }
    return null;
  });
  return r.ok ? { ok: true, entryId: savedId } : r;
}

export async function removeEntry(code: string, entryId: string, expectedVersion: number, actor: Actor): Promise<StoreResult> {
  return mutate(code, expectedVersion, actor, "stamp.rulebook.remove", (doc) => {
    const i = doc.entries.findIndex((e) => e.id === entryId);
    if (i < 0) return { ok: false, errors: ["That entry no longer exists."] };
    const [gone] = doc.entries.splice(i, 1);
    hist(doc, actor, "remove", entryId, `removed ${gone.category}${gone.confirmation ? " (was confirmed)" : ""}`);
    return null;
  });
}

/** Marks an entry as checked against its source. Needs the amount, the source link and the effective date. */
export async function confirmEntry(code: string, entryId: string, expectedVersion: number, actor: Actor): Promise<StoreResult> {
  return mutate(code, expectedVersion, actor, "stamp.rulebook.confirm", (doc) => {
    const e = doc.entries.find((x) => x.id === entryId);
    if (!e) return { ok: false, errors: ["That entry no longer exists."] };
    const errs = validateForConfirm(contentOf(e));
    if (errs.length) return { ok: false, errors: errs };
    e.confirmation = { by: actor.email, on: new Date().toISOString(), snapshot: snapshotOf(e) };
    hist(doc, actor, "confirm", entryId, `confirmed ${e.category}`);
    return null;
  });
}

export async function unconfirmEntry(code: string, entryId: string, expectedVersion: number, actor: Actor): Promise<StoreResult> {
  return mutate(code, expectedVersion, actor, "stamp.rulebook.unconfirm", (doc) => {
    const e = doc.entries.find((x) => x.id === entryId);
    if (!e) return { ok: false, errors: ["That entry no longer exists."] };
    e.confirmation = null;
    hist(doc, actor, "unconfirm", entryId, `confirmation removed from ${e.category}`);
    return null;
  });
}

/**
 * Copies another jurisdiction's entries into this one as NEW, UNCONFIRMED drafts (a starting point for a state whose law is similar).
 * Existing entries are kept. The copy says where it came from and must be checked against this state's own Act.
 */
export async function copyEntries(fromCode: string, toCode: string, expectedVersion: number, actor: Actor, onlyCategories?: string[]): Promise<StoreResult<{ copied: number }>> {
  const from = jurisdictionByCode(fromCode);
  if (!from || fromCode === toCode) return { ok: false, errors: ["Choose a different state or union territory to copy from."] };
  const src = await (await col()).findOne({ _id: fromCode });
  const chosen = (src?.entries ?? []).filter((e) => !onlyCategories || onlyCategories.includes(e.category));
  if (chosen.length === 0) return { ok: false, errors: [`${from.name} has no entries to copy.`] };
  const r = await mutate(toCode, expectedVersion, actor, "stamp.rulebook.copy", (doc) => {
    const at = new Date().toISOString();
    for (const e of chosen) {
      const c = contentOf(e);
      doc.entries.push({ ...c, notes: `Copied from ${from.name}; not checked for this state. ${c.notes}`.trim(), id: randomUUID(), confirmation: null, updatedBy: actor.email, updatedAt: at });
    }
    hist(doc, actor, "copy", null, `copied ${chosen.length} entr${chosen.length === 1 ? "y" : "ies"} from ${from.name}`);
    return null;
  });
  return r.ok ? { ok: true, copied: chosen.length } : r;
}

export async function jurisdictionHistory(code: string): Promise<{ at: string; by: string; action: HistoryAction; entryId: string | null; detail: string }[]> {
  const d = await (await col()).findOne({ _id: code });
  return (d?.history ?? []).slice(-100).reverse().map((h) => ({ at: h.at.toISOString(), by: h.by, action: h.action, entryId: h.entryId, detail: h.detail }));
}
