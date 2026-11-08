import type { Collection, Db, Document } from "mongodb";
import { KEY_SEPARATOR, isGlobalCollection, isKeyedCollection } from "@/lib/platform/tenancy/collections";

/**
 * Company-scoped view of a MongoDB `Db`. Every collection handed out by
 * `scopeDb(db, companyId).collection(name)` behaves like the driver's own
 * `Collection`, except that every operation is confined to one company:
 *
 *  - reads/updates/deletes/counts get `companyId` ANDed into their filter
 *  - inserts/replacements get `companyId` stamped onto the document
 *  - update operators can never change or unset `companyId`
 *  - aggregations get a leading `$match`, and every `$lookup` / `$unionWith` /
 *    `$graphLookup` into another scoped collection is confined too
 *  - unique indexes are created with `companyId` as their first key, so
 *    uniqueness (emails, slugs, codes) is per company, not platform-wide
 *  - collection-wide operations that can't be scoped (`drop`, `rename`,
 *    change streams, legacy bulk builders) throw instead of touching every
 *    company's data
 *
 * Keyed collections (see `collections.ts`) additionally store their `_id` as
 * `<companyId>::<key>`, translated in and out transparently.
 *
 * This is what makes isolation the default for the ~800 existing call sites:
 * they keep calling `getDb()`, and a query that forgets about companies
 * cannot see another company's rows. Cross-company work (company registry,
 * platform jobs) must ask for `getPlatformDb()` explicitly.
 */

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

type Doc = Record<string, unknown>;
type Fn = (...args: unknown[]) => unknown;

function isPlainObject(value: unknown): value is Doc {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const RANGE_OPS = ["$eq", "$ne", "$gt", "$gte", "$lt", "$lte"] as const;
const LIST_OPS = ["$in", "$nin"] as const;

interface KeyCodec {
  wrap(value: unknown): unknown;
  wrapCondition(condition: unknown): unknown;
  unwrap(value: unknown): unknown;
  unwrapDoc<T>(doc: T): T;
}

function keyCodec(companyId: string): KeyCodec {
  const prefix = `${companyId}${KEY_SEPARATOR}`;
  const wrap = (value: unknown) => (typeof value === "string" ? prefix + value : value);
  const unwrap = (value: unknown) => (typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : value);
  return {
    wrap,
    unwrap,
    wrapCondition(condition) {
      if (!isPlainObject(condition)) return wrap(condition);
      const out: Doc = { ...condition };
      for (const op of RANGE_OPS) if (op in out) out[op] = wrap(out[op]);
      for (const op of LIST_OPS) if (Array.isArray(out[op])) out[op] = (out[op] as unknown[]).map(wrap);
      return out;
    },
    unwrapDoc<T>(doc: T): T {
      if (!isPlainObject(doc) || !("_id" in doc)) return doc;
      return { ...doc, _id: unwrap(doc._id) } as T;
    },
  };
}

// ---------------------------------------------------------------------------
// Filters, documents, updates
// ---------------------------------------------------------------------------

function scopeFilter(filter: unknown, companyId: string, codec: KeyCodec | null): Doc {
  const f: Doc = isPlainObject(filter) ? { ...filter } : {};
  if (codec && "_id" in f) f._id = codec.wrapCondition(f._id);
  if ("companyId" in f) return { $and: [f, { companyId }] };
  f.companyId = companyId;
  return f;
}

function scopeDoc(doc: unknown, companyId: string, codec: KeyCodec | null): Doc {
  if (!isPlainObject(doc)) throw new TenantScopeError("Expected a plain document to insert");
  const d: Doc = { ...doc, companyId };
  if (codec && "_id" in d) d._id = codec.wrap(d._id);
  return d;
}

function scopeUpdate(update: unknown, companyId: string, codec: KeyCodec | null): unknown {
  // Aggregation-pipeline update: pin companyId as the last stage.
  if (Array.isArray(update)) return [...update, { $set: { companyId } }];
  if (!isPlainObject(update)) return update;
  const u: Doc = { ...update };
  for (const [op, fields] of Object.entries(u)) {
    if (!op.startsWith("$") || !isPlainObject(fields)) continue;
    const inner: Doc = { ...fields };
    delete inner.companyId;
    if (codec && "_id" in inner && (op === "$set" || op === "$setOnInsert")) inner._id = codec.wrap(inner._id);
    u[op] = inner;
  }
  return u;
}

// ---------------------------------------------------------------------------
// Aggregation pipelines
// ---------------------------------------------------------------------------

function companyMatch(companyId: string): Doc {
  return { $match: { companyId } };
}

function mergeCondition(condition: unknown, companyId: string): Doc {
  if (!isPlainObject(condition)) return { companyId };
  return "companyId" in condition ? { $and: [condition, { companyId }] } : { ...condition, companyId };
}

/** Confines any stage that reads from another collection. */
function scopeStage(stage: unknown, companyId: string): unknown {
  if (!isPlainObject(stage)) return stage;
  if (isPlainObject(stage.$lookup)) {
    const lookup = stage.$lookup;
    if (typeof lookup.from === "string" && isGlobalCollection(lookup.from)) return stage;
    const inner = Array.isArray(lookup.pipeline) ? lookup.pipeline.map((s) => scopeStage(s, companyId)) : [];
    return { $lookup: { ...lookup, pipeline: [companyMatch(companyId), ...inner] } };
  }
  if ("$unionWith" in stage) {
    const u = stage.$unionWith;
    const coll = typeof u === "string" ? u : isPlainObject(u) ? (u.coll as string) : undefined;
    if (coll && isGlobalCollection(coll)) return stage;
    const inner = isPlainObject(u) && Array.isArray(u.pipeline) ? u.pipeline.map((s) => scopeStage(s, companyId)) : [];
    return { $unionWith: { ...(isPlainObject(u) ? u : {}), coll, pipeline: [companyMatch(companyId), ...inner] } };
  }
  if (isPlainObject(stage.$graphLookup)) {
    const g = stage.$graphLookup;
    if (typeof g.from === "string" && isGlobalCollection(g.from)) return stage;
    return { $graphLookup: { ...g, restrictSearchWithMatch: mergeCondition(g.restrictSearchWithMatch, companyId) } };
  }
  if (isPlainObject(stage.$facet)) {
    const facets: Doc = {};
    for (const [k, p] of Object.entries(stage.$facet)) facets[k] = Array.isArray(p) ? p.map((s) => scopeStage(s, companyId)) : p;
    return { $facet: facets };
  }
  if ("$out" in stage || "$merge" in stage) {
    throw new TenantScopeError("$out/$merge write outside company scoping — use getPlatformDb() deliberately");
  }
  return stage;
}

/** Stages that must stay first in a pipeline; the company $match goes right after them. */
const LEADING_STAGES = ["$search", "$searchMeta", "$vectorSearch", "$collStats", "$indexStats"];

function scopePipeline(pipeline: unknown, companyId: string, codec: KeyCodec | null): Doc[] {
  const stages = (Array.isArray(pipeline) ? pipeline : []).map((s) => scopeStage(s, companyId)) as Doc[];
  if (codec) {
    for (let i = 0; i < stages.length; i++) {
      const m = stages[i].$match;
      if (isPlainObject(m) && "_id" in m) stages[i] = { $match: { ...m, _id: codec.wrapCondition(m._id) } };
    }
  }
  const first = stages[0];
  if (first && isPlainObject(first.$geoNear)) {
    stages[0] = { $geoNear: { ...first.$geoNear, query: mergeCondition(first.$geoNear.query, companyId) } };
  } else if (first && LEADING_STAGES.some((s) => s in first)) {
    stages.splice(1, 0, companyMatch(companyId));
  } else {
    stages.unshift(companyMatch(companyId));
  }
  return stages;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/** Puts companyId first in an index key spec (object or single-field string forms). */
function prefixIndexKey(spec: unknown): unknown {
  if (typeof spec === "string") return { companyId: 1, [spec]: 1 };
  if (isPlainObject(spec) && !("companyId" in spec)) return { companyId: 1, ...spec };
  return spec;
}

function needsCompanyPrefix(options: unknown): boolean {
  return isPlainObject(options) && options.unique === true && options.expireAfterSeconds === undefined;
}

// ---------------------------------------------------------------------------
// Collection proxy
// ---------------------------------------------------------------------------

/** Driver methods that are safe to pass straight through (no data access, or structural only). */
const PASS_THROUGH = new Set([
  "indexes",
  "listIndexes",
  "indexExists",
  "indexInformation",
  "options",
  "isCapped",
  "dropIndex",
  "dropIndexes",
  "listSearchIndexes",
  "createSearchIndex",
  "createSearchIndexes",
  "updateSearchIndex",
  "dropSearchIndex",
]);

function scopeCollection<T extends Document>(col: Collection<T>, name: string, companyId: string): Collection<T> {
  const codec = isKeyedCollection(name) ? keyCodec(companyId) : null;
  const raw = col as unknown as Record<string, Fn>;
  const call = (method: string, ...args: unknown[]) => raw[method].apply(col, args);
  const filter = (f: unknown) => scopeFilter(f, companyId, codec);
  const doc = (d: unknown) => scopeDoc(d, companyId, codec);
  const update = (u: unknown) => scopeUpdate(u, companyId, codec);
  const unwrapResult = (r: unknown) => {
    if (!codec) return r;
    if (isPlainObject(r) && "value" in r && "ok" in r) return { ...r, value: codec.unwrapDoc(r.value) };
    return codec.unwrapDoc(r);
  };
  const mapCursor = (cursor: unknown) => (codec ? (cursor as { map: (fn: (d: unknown) => unknown) => unknown }).map((d) => codec.unwrapDoc(d)) : cursor);
  const unwrapUpsert = async (p: unknown) => {
    const r = (await p) as Doc;
    return codec && r && "upsertedId" in r ? { ...r, upsertedId: codec.unwrap(r.upsertedId) } : r;
  };

  const overrides: Record<string, Fn> = {
    find: (f, opts) => mapCursor(call("find", filter(f), opts)),
    findOne: async (f, opts) => unwrapResult(await call("findOne", filter(f), opts)),
    countDocuments: (f, opts) => call("countDocuments", filter(f), opts),
    estimatedDocumentCount: (opts) => call("countDocuments", filter({}), opts),
    distinct: async (key, f, opts) => {
      const values = (await call("distinct", key, filter(f), opts)) as unknown[];
      return codec && key === "_id" ? values.map((v) => codec.unwrap(v)) : values;
    },
    aggregate: (pipeline, opts) => mapCursor(call("aggregate", scopePipeline(pipeline, companyId, codec), opts)),

    insertOne: async (d, opts) => {
      const scoped = doc(d);
      const result = (await call("insertOne", scoped, opts)) as Doc;
      // The driver assigns _id onto the object it was given; mirror that onto the caller's object.
      if (isPlainObject(d) && !("_id" in d)) d._id = codec ? codec.unwrap(scoped._id) : scoped._id;
      return codec ? { ...result, insertedId: codec.unwrap(result.insertedId) } : result;
    },
    insertMany: async (docs, opts) => {
      const list = Array.isArray(docs) ? docs : [];
      const scoped = list.map(doc);
      const result = (await call("insertMany", scoped, opts)) as Doc;
      list.forEach((d, i) => {
        if (isPlainObject(d) && !("_id" in d)) d._id = codec ? codec.unwrap(scoped[i]._id) : scoped[i]._id;
      });
      if (!codec || !isPlainObject(result.insertedIds)) return result;
      const ids: Doc = {};
      for (const [i, id] of Object.entries(result.insertedIds)) ids[i] = codec.unwrap(id);
      return { ...result, insertedIds: ids };
    },

    updateOne: (f, u, opts) => unwrapUpsert(call("updateOne", filter(f), update(u), opts)),
    updateMany: (f, u, opts) => unwrapUpsert(call("updateMany", filter(f), update(u), opts)),
    replaceOne: (f, d, opts) => unwrapUpsert(call("replaceOne", filter(f), doc(d), opts)),
    deleteOne: (f, opts) => call("deleteOne", filter(f), opts),
    deleteMany: (f, opts) => call("deleteMany", filter(f), opts),
    findOneAndUpdate: async (f, u, opts) => unwrapResult(await call("findOneAndUpdate", filter(f), update(u), opts)),
    findOneAndReplace: async (f, d, opts) => unwrapResult(await call("findOneAndReplace", filter(f), doc(d), opts)),
    findOneAndDelete: async (f, opts) => unwrapResult(await call("findOneAndDelete", filter(f), opts)),

    bulkWrite: (ops, opts) => {
      const scopedOps = (Array.isArray(ops) ? ops : []).map((op: Doc) => {
        const [type, body] = Object.entries(op)[0] as [string, Doc];
        switch (type) {
          case "insertOne":
            return { insertOne: { ...body, document: doc(body.document) } };
          case "updateOne":
          case "updateMany":
            return { [type]: { ...body, filter: filter(body.filter), update: update(body.update) } };
          case "replaceOne":
            return { replaceOne: { ...body, filter: filter(body.filter), replacement: doc(body.replacement) } };
          case "deleteOne":
          case "deleteMany":
            return { [type]: { ...body, filter: filter(body.filter) } };
          default:
            throw new TenantScopeError(`Unsupported bulkWrite operation "${type}"`);
        }
      });
      return call("bulkWrite", scopedOps, opts);
    },

    createIndex: (spec, opts) => call("createIndex", needsCompanyPrefix(opts) ? prefixIndexKey(spec) : spec, opts),
    createIndexes: (specs, opts) => {
      const list = (Array.isArray(specs) ? specs : []).map((s: Doc) => (needsCompanyPrefix(s) ? { ...s, key: prefixIndexKey(s.key) } : s));
      return call("createIndexes", list, opts);
    },
  };

  return new Proxy(col, {
    get(target, prop) {
      if (typeof prop === "string" && prop in overrides) return overrides[prop];
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      // Symbol-keyed members are runtime plumbing (inspect, async disposal), not data access.
      if (typeof prop === "symbol" || PASS_THROUGH.has(prop)) return value.bind(target);
      return () => {
        throw new TenantScopeError(`Collection.${String(prop)}() is not available on company-scoped collection "${name}" — use getPlatformDb() deliberately`);
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Db proxy
// ---------------------------------------------------------------------------

const scopedDbCache = new Map<string, Db>();

export function scopeDb(db: Db, companyId: string): Db {
  const cacheKey = `${db.databaseName}\u0000${companyId}`;
  const cached = scopedDbCache.get(cacheKey);
  if (cached) return cached;

  const collections = new Map<string, Collection<Document>>();
  const collection = (name: string, options?: unknown) => {
    if (isGlobalCollection(name)) return db.collection(name, options as never);
    if (options !== undefined) return scopeCollection(db.collection(name, options as never), name, companyId);
    let c = collections.get(name);
    if (!c) {
      c = scopeCollection(db.collection(name), name, companyId);
      collections.set(name, c);
    }
    return c;
  };

  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === "collection") return collection;
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (typeof prop === "symbol") return value.bind(target);
      return () => {
        throw new TenantScopeError(`Db.${String(prop)}() is not available on a company-scoped Db — use getPlatformDb() deliberately`);
      };
    },
  });
  scopedDbCache.set(cacheKey, proxy);
  return proxy;
}
