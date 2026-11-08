import "server-only";
import type { Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/spendiq/db";

/**
 * Generic soft-deleted + audited Mongo collection helper. Every simple PRMS
 * CRUD module (infrastructure, subscriptions, third-party, contracts, assets,
 * inventory items, budgets, expenses) is built on this so the read / write /
 * search / export / code-generation logic lives in one place.
 */

export interface BaseDoc extends AuditFields {
  _id: string;
}

type AnyDoc = Record<string, unknown> & { _id: string };

export interface ResourceConfig {
  collection: string;
  /** e.g. "AST" — generates `AST-0001` codes into `codeField`. */
  codePrefix?: string;
  codeCounter?: string;
  codeField?: string;
  /** Regex-searched fields for the `search` filter. */
  searchFields: string[];
  /** Single-field indexes to ensure. `codeField` is always unique-indexed. */
  indexes?: string[];
}

export interface SearchOpts {
  search?: string;
  filters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

const EXPORT_ROW_LIMIT = 5000;

export function defineResource<T extends BaseDoc>(config: ResourceConfig) {
  let indexesEnsured = false;

  async function collection() {
    const db = await getDb();
    const col = db.collection<AnyDoc>(config.collection);
    if (!indexesEnsured) {
      indexesEnsured = true;
      const jobs: Promise<unknown>[] = [col.createIndex({ createdAt: -1 }).catch(() => {})];
      if (config.codeField) {
        jobs.push(col.createIndex({ [config.codeField]: 1 }, { unique: true }).catch(() => {}));
      }
      for (const f of config.indexes ?? []) {
        jobs.push(col.createIndex({ [f]: 1 }).catch(() => {}));
      }
      await Promise.all(jobs);
    }
    return col;
  }

  async function generateCode(): Promise<string> {
    if (!config.codePrefix || !config.codeCounter) return newId();
    return formatCode(config.codePrefix, await nextSequence(config.codeCounter));
  }

  function buildFilter(opts: SearchOpts): Filter<AnyDoc> {
    const filter: Record<string, unknown> = { ...notDeleted };
    if (opts.search?.trim() && config.searchFields.length) {
      const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
      filter.$or = config.searchFields.map((f) => ({ [f]: rx }));
    }
    for (const [k, v] of Object.entries(opts.filters ?? {})) {
      if (v !== undefined && v !== null && v !== "") filter[k] = v;
    }
    return filter as Filter<AnyDoc>;
  }

  return {
    collectionName: config.collection,
    getCollection: collection,
    generateCode,
    buildFilter,

    async getOne(id: string): Promise<T | null> {
      const col = await collection();
      return (await col.findOne({ _id: id, ...notDeleted })) as T | null;
    },

    async search(opts: SearchOpts = {}) {
      const col = await collection();
      const page = Math.max(opts.page ?? 1, 1);
      const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
      const filter = buildFilter(opts);
      const sortField = opts.sortBy || "createdAt";
      const sortDir: 1 | -1 = opts.sortDir === "asc" ? 1 : -1;
      const [items, total] = await Promise.all([
        col.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
        col.countDocuments(filter),
      ]);
      return {
        items: items as unknown as T[],
        total,
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      };
    },

    async count(filters: Record<string, unknown> = {}): Promise<number> {
      const col = await collection();
      return col.countDocuments(buildFilter({ filters }));
    },

    async list(filters: Record<string, unknown> = {}): Promise<T[]> {
      const col = await collection();
      return (await col
        .find(buildFilter({ filters }))
        .sort({ createdAt: -1 })
        .limit(EXPORT_ROW_LIMIT)
        .toArray()) as unknown as T[];
    },

    async create(data: Record<string, unknown>, actorId: string): Promise<T> {
      const col = await collection();
      const doc: AnyDoc = {
        _id: newId(),
        ...(config.codeField ? { [config.codeField]: await generateCode() } : {}),
        ...data,
        ...createStamp(actorId),
      };
      await col.insertOne(doc);
      return doc as unknown as T;
    },

    async update(id: string, data: Record<string, unknown>, actorId: string): Promise<T | null> {
      const col = await collection();
      return (await col.findOneAndUpdate(
        { _id: id, ...notDeleted },
        { $set: { ...data, ...updateStamp(actorId) } },
        { returnDocument: "after" }
      )) as T | null;
    },

    async softDelete(id: string, actorId: string): Promise<boolean> {
      const col = await collection();
      const res = await col.updateOne(
        { _id: id, ...notDeleted },
        { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
      );
      return res.modifiedCount === 1;
    },
  };
}
