import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { AgentUser, EntityDef, FieldDef, Json } from "@/lib/ai/agent/types";

/**
 * Generic record access for the agent, always inside the signed-in company (via `getDb()`), through a declared entity: only its
 * collection, only its fields. Secrets never leave: any key that looks like a password, token, key, hash or bank/ID number is
 * stripped from every result, whatever the entity says.
 */

const SECRET_KEY = /password|passwd|secret|token|api_?key|hash|\botp\b|salt|cvv|iban|ifsc|account_?number|routing|aadhaar|aadhar|^pan(_?number|_?card)?$|ssn|private_?key|encrypted|cipher|credential/i;
const HEX24 = /^[a-f0-9]{24}$/i;
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;

export const MAX_LIST = 25;

export function clean(v: unknown, hide: ReadonlySet<string>, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof ObjectId) return v.toHexString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v.length > 600 ? `${v.slice(0, 600)}…` : v;
  if (typeof v !== "object") return v;
  if (depth > 3) return "[…]";
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, hide, depth + 1));
  if (Buffer.isBuffer(v)) return "[binary]";
  const out: Json = {};
  for (const [k, val] of Object.entries(v as Json)) {
    if (k === "companyId" || SECRET_KEY.test(k) || hide.has(k)) continue;
    out[k] = clean(val, hide, depth + 1);
  }
  return out;
}

const hideSet = (def: EntityDef) => new Set(def.hide ?? []);

async function col(def: EntityDef) {
  return (await getDb()).collection<Json>(def.collection);
}

async function allCols(def: EntityDef) {
  const db = await getDb();
  const names = def.collections ? await def.collections() : [def.collection];
  return names.map((n) => ({ name: n, c: db.collection<Json>(n) }));
}

/** Ids are stored as uuid strings or ObjectIds depending on the product; an entity that doesn't say matches either. */
function idValue(def: EntityDef, id: string): unknown {
  if (def.idType === "string") return id;
  if (def.idType === "objectId") return HEX24.test(id) ? new ObjectId(id) : id;
  return HEX24.test(id) ? { $in: [id, new ObjectId(id)] } : id;
}

function scalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Turns the model's plain `{field: value}` filters into a safe Mongo filter (equality, lists, and date/number ranges only). */
export function buildFilter(def: EntityDef, filters: unknown, q?: string): { ok: true; filter: Json } | { ok: false; error: string } {
  const and: Json[] = [];
  if (def.baseFilter) and.push(def.baseFilter);
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [k, raw] of Object.entries(filters as Json)) {
      if (!SAFE_KEY.test(k) || k.startsWith("$")) return { ok: false, error: `"${k}" is not a valid field name.` };
      if (SECRET_KEY.test(k)) return { ok: false, error: `"${k}" can't be filtered on.` };
      const eq = (v: unknown): unknown => {
        if (typeof v === "string" && HEX24.test(v)) return k === "_id" ? idValue(def, v) : { $in: [v, new ObjectId(v)] };
        return v;
      };
      if (Array.isArray(raw)) {
        const vals = raw.filter(scalar).slice(0, 50);
        const flat: unknown[] = vals.flatMap<unknown>((v) => (typeof v === "string" && HEX24.test(v) ? (k === "_id" ? [HEX24.test(v) && def.idType !== "string" ? new ObjectId(v) : v] : [v, new ObjectId(v)]) : [v]));
        and.push({ [k]: { $in: flat } } as Json);
      } else if (scalar(raw)) {
        const e = eq(raw);
        and.push({ [k]: e });
      } else if (raw && typeof raw === "object") {
        const range: Json = {};
        for (const [op, val] of Object.entries(raw as Json)) {
          if (!["gt", "gte", "lt", "lte", "ne"].includes(op)) return { ok: false, error: `Unsupported filter operator "${op}". Use gt, gte, lt, lte or ne.` };
          if (!scalar(val)) return { ok: false, error: `Filter "${k}.${op}" needs a plain value.` };
          range[`$${op}`] = typeof val === "string" && DATE_RE.test(val) && !isNaN(Date.parse(val)) ? { __date: val } : val;
        }
        // A date range matches both stored Dates and stored ISO strings.
        const dateOps = Object.fromEntries(Object.entries(range).map(([o, v]) => [o, v && typeof v === "object" && "__date" in (v as Json) ? new Date((v as { __date: string }).__date) : v]));
        const strOps = Object.fromEntries(Object.entries(range).map(([o, v]) => [o, v && typeof v === "object" && "__date" in (v as Json) ? (v as { __date: string }).__date : v]));
        and.push(Object.values(range).some((v) => v && typeof v === "object") ? { $or: [{ [k]: dateOps }, { [k]: strOps }] } : { [k]: range });
      } else if (raw === null) {
        and.push({ [k]: null });
      } else {
        return { ok: false, error: `Filter "${k}" has an unsupported value.` };
      }
    }
  }
  const term = (q ?? "").trim().slice(0, 80);
  if (term && def.search?.length) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({ $or: def.search.map((f) => ({ [f]: re })) });
  }
  return { ok: true, filter: and.length ? { $and: and } : {} };
}

export async function findRecords(def: EntityDef, opts: { filters?: unknown; q?: string; sort?: string; desc?: boolean; limit?: number; skip?: number }): Promise<Json> {
  const f = buildFilter(def, opts.filters, opts.q);
  if (!f.ok) return { error: f.error };
  const sortKey = opts.sort && SAFE_KEY.test(opts.sort) && !SECRET_KEY.test(opts.sort) ? opts.sort : "createdAt";
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 10), 1), MAX_LIST);
  const cols = await allCols(def);
  const per = await Promise.all(
    cols.map(async ({ name, c }) => ({
      name,
      rows: await c.find(f.filter).sort({ [sortKey]: opts.desc === false ? 1 : -1, _id: -1 }).skip(cols.length === 1 ? Math.max(0, Math.floor(opts.skip ?? 0)) : 0).limit(limit + (cols.length === 1 ? 0 : Math.max(0, Math.floor(opts.skip ?? 0)))).toArray(),
      total: await c.countDocuments(f.filter),
    })),
  );
  const hide = hideSet(def);
  let rows = per.flatMap((p) => p.rows.map((r) => ({ ...r, ...(def.collections ? { _collection: p.name } : {}) })));
  if (cols.length > 1) {
    const key = (r: Json) => { const v = r[sortKey]; return v instanceof Date ? v.getTime() : typeof v === "number" ? v : String(v ?? ""); };
    rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0) * (opts.desc === false ? -1 : 1));
    rows = rows.slice(Math.max(0, Math.floor(opts.skip ?? 0)), Math.max(0, Math.floor(opts.skip ?? 0)) + limit);
  }
  return { entity: def.key, total: per.reduce((s, p) => s + p.total, 0), returned: rows.length, records: rows.map((r) => clean(r, hide)) };
}

export async function getRecord(def: EntityDef, id: string): Promise<Json> {
  const base = def.baseFilter ?? {};
  let doc: Json | null = null;
  for (const { name, c } of await allCols(def)) {
    doc = (await c.findOne({ $and: [base, { _id: idValue(def, id) }] } as never)) as Json | null;
    if (doc) {
      if (def.collections) doc = { ...doc, _collection: name };
      break;
    }
  }
  if (!doc) return { error: `No ${def.label.toLowerCase()} found with id ${id}.` };
  return { entity: def.key, record: clean(doc, hideSet(def)) };
}

export async function groupRecords(def: EntityDef, opts: { groupBy: string; filters?: unknown; sumField?: string }): Promise<Json> {
  if (!SAFE_KEY.test(opts.groupBy) || SECRET_KEY.test(opts.groupBy)) return { error: "That field can't be grouped." };
  const f = buildFilter(def, opts.filters);
  if (!f.ok) return { error: f.error };
  const sum = opts.sumField && SAFE_KEY.test(opts.sumField) && !SECRET_KEY.test(opts.sumField) ? opts.sumField : null;
  const per = await Promise.all((await allCols(def)).map(({ c }) => c
    .aggregate([{ $match: f.filter }, { $group: { _id: `$${opts.groupBy}`, count: { $sum: 1 }, ...(sum ? { sum: { $sum: { $toDouble: { $ifNull: [`$${sum}`, 0] } } } } : {}) } }, { $sort: { count: -1 } }, { $limit: 40 }])
    .toArray()));
  const merged = new Map<string, { value: unknown; count: number; sum: number }>();
  for (const r of per.flat()) {
    const k = JSON.stringify(clean(r._id, new Set()));
    const m = merged.get(k) ?? { value: clean(r._id, new Set()), count: 0, sum: 0 };
    m.count += r.count as number;
    m.sum += (r.sum as number) ?? 0;
    merged.set(k, m);
  }
  const groups = [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 40);
  return { entity: def.key, groupBy: opts.groupBy, groups: groups.map((g) => ({ value: g.value, count: g.count, ...(sum ? { sum: g.sum } : {}) })) };
}

/** What a stored row of a read-only entity looks like: field names and kinds from a few real rows. */
export async function discoverFields(def: EntityDef): Promise<{ key: string; type: string }[]> {
  const rows = (await Promise.all((await allCols(def)).map(({ c }) => c.find(def.baseFilter ?? {}).sort({ _id: -1 }).limit(3).toArray()))).flat();
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "companyId" || SECRET_KEY.test(k) || (def.hide ?? []).includes(k) || seen.has(k)) continue;
      seen.set(k, v instanceof Date ? "date" : v instanceof ObjectId ? "id" : Array.isArray(v) ? "list" : v === null ? "empty" : typeof v);
    }
  }
  return [...seen].map(([key, type]) => ({ key, type }));
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function coerce(f: FieldDef, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const bad = (m: string) => ({ ok: false as const, error: `${f.label}: ${m}` });
  switch (f.type) {
    case "string":
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") return bad("must be text.");
      const t = String(raw).trim();
      if (!t && f.required) return bad("can't be empty.");
      return { ok: true, value: t.slice(0, f.type === "text" ? 5000 : 500) };
    }
    case "email": {
      const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return EMAIL.test(t) ? { ok: true, value: t } : bad("must be a valid email address.");
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.replace(/,/g, "")) : NaN;
      return Number.isFinite(n) ? { ok: true, value: n } : bad("must be a number.");
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "yes") return { ok: true, value: true };
      if (raw === "false" || raw === "no") return { ok: true, value: false };
      return bad("must be true or false.");
    }
    case "date":
    case "dateString": {
      const t = typeof raw === "string" ? raw.trim() : "";
      const d = new Date(t);
      if (!t || isNaN(d.getTime())) return bad("must be a date like 2026-10-31.");
      return { ok: true, value: f.type === "date" ? d : d.toISOString().slice(0, 10) };
    }
    case "enum": {
      const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const hit = (f.options ?? []).find((o) => o.toLowerCase() === t);
      return hit ? { ok: true, value: hit } : bad(`must be one of: ${(f.options ?? []).join(", ")}.`);
    }
    case "ref": {
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!t) return bad("needs an id (look it up first).");
      return { ok: true, value: f.store === "objectId" ? (HEX24.test(t) ? new ObjectId(t) : null) : t } as never;
    }
    case "json": {
      if (raw === null || typeof raw !== "object") return bad("must be structured data (a list or an object).");
      if (JSON.stringify(raw).length > 20_000) return bad("is too large.");
      return { ok: true, value: raw };
    }
    case "stringList": {
      const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 50) : typeof raw === "string" ? raw.split(",").map((x) => x.trim()).filter(Boolean) : null;
      return list ? { ok: true, value: list } : bad("must be a list.");
    }
  }
}

/** Validates and converts the model's values to what is stored. Unknown and read-only fields are rejected, so nothing is silently dropped. */
export function prepare(def: EntityDef, data: unknown, mode: "create" | "update"): { ok: true; values: Json } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const values: Json = {};
  const fields = def.fields ?? [];
  const input = data && typeof data === "object" && !Array.isArray(data) ? (data as Json) : {};
  for (const [k, raw] of Object.entries(input)) {
    const f = fields.find((x) => x.key === k);
    if (!f || f.readOnly) {
      problems.push(`"${k}" is not a field you can set on ${def.label}.`);
      continue;
    }
    if (mode === "update" && f.createOnly) {
      problems.push(`${f.label} can't be changed after it is created.`);
      continue;
    }
    if (raw === null || raw === "") {
      if (mode === "update" && !f.required) values[k] = null;
      continue;
    }
    const c = coerce(f, raw);
    if (c.ok) values[k] = c.value;
    else problems.push(c.error);
  }
  if (mode === "create") for (const f of fields) if (f.required && !f.readOnly && values[f.key] === undefined) problems.push(`${f.label} (${f.key}) is required.`);
  if (mode === "update" && Object.keys(values).length === 0 && problems.length === 0) problems.push("Nothing to change.");
  return problems.length ? { ok: false, problems } : { ok: true, values };
}

export async function createRecord(def: EntityDef, values: Json, user: AgentUser): Promise<Json> {
  const now = new Date();
  const extra = (await def.onCreate?.(values, user)) ?? {};
  const doc = { ...extra, ...values, createdAt: now, updatedAt: now };
  const res = await (await col(def)).insertOne((def.idType === "string" ? { _id: (extra as Json)._id ?? new ObjectId().toHexString(), ...doc } : doc) as never);
  return { ok: true, id: String(res.insertedId), record: clean({ _id: res.insertedId, ...doc }, hideSet(def)) };
}

export async function updateRecord(def: EntityDef, id: string, values: Json): Promise<Json> {
  const c = await col(def);
  const filter = { $and: [def.baseFilter ?? {}, { _id: idValue(def, id) }] };
  const res = await c.findOneAndUpdate(filter as never, { $set: { ...values, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!res) return { error: `No ${def.label.toLowerCase()} found with id ${id}.` };
  return { ok: true, id, record: clean(res, hideSet(def)) };
}

export async function deleteRecord(def: EntityDef, id: string): Promise<Json> {
  const c = await col(def);
  const res = await c.findOneAndDelete({ $and: [def.baseFilter ?? {}, { _id: idValue(def, id) }] } as never);
  if (!res) return { error: `No ${def.label.toLowerCase()} found with id ${id}.` };
  return { ok: true, id, deleted: clean(res, hideSet(def)) };
}

/** A human label for a stored row, for approval cards. */
export function titleOf(def: EntityDef, row: Json | null | undefined): string {
  if (!row) return "";
  const keys = [def.titleField, "name", "title", "fullName", "subject", "email", "code"].filter(Boolean) as string[];
  for (const k of keys) if (typeof row[k] === "string" && row[k]) return String(row[k]);
  return String(row._id ?? "");
}

export async function peek(def: EntityDef, id: string): Promise<Json | null> {
  for (const { c } of await allCols(def)) {
    const doc = await c.findOne({ $and: [def.baseFilter ?? {}, { _id: idValue(def, id) }] } as never);
    if (doc) return doc as Json;
  }
  return null;
}

export async function logAgentAction(user: AgentUser, panel: string, entry: Json): Promise<void> {
  try {
    await (await getDb()).collection("ai_agent_actions").insertOne({ userId: user.id, email: user.email, panel, ...entry, at: new Date() });
  } catch (err) {
    console.error("[ai-agent] could not log action", err);
  }
}

// ── Write dispatch: the product's own function when it has one ─────────────────────────────────────────────────────────────────────

export const canCreate = (d: EntityDef) => Boolean(d.fields && d.write && (d.ops?.create || d.rawWrite));
export const canUpdate = (d: EntityDef) => Boolean(d.fields && d.write && (d.ops?.update || d.rawWrite));
export const canRemove = (d: EntityDef) => Boolean(d.write && d.canDelete && (d.ops?.remove || d.rawWrite));

function shaped(def: EntityDef, out: Json): Json {
  const rec = out.record ?? out.created ?? out.updated;
  const recId = rec && typeof rec === "object" ? (rec as Json)._id : undefined;
  return { ...out, ...(out.id === undefined && recId !== undefined ? { id: String(recId) } : {}), ...(rec && typeof rec === "object" ? { record: clean(rec, hideSet(def)) } : {}) };
}

export async function doCreate(def: EntityDef, values: Json, user: AgentUser): Promise<Json> {
  if (def.ops?.create) return shaped(def, await def.ops.create(values, user));
  return createRecord(def, values, user);
}
export async function doUpdate(def: EntityDef, id: string, values: Json, user: AgentUser): Promise<Json> {
  if (def.ops?.update) return shaped(def, await def.ops.update(id, values, user));
  return updateRecord(def, id, values);
}
export async function doRemove(def: EntityDef, id: string, user: AgentUser): Promise<Json> {
  if (def.ops?.remove) return shaped(def, await def.ops.remove(id, user));
  return deleteRecord(def, id);
}
