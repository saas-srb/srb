import "server-only";
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
} from "@/lib/products/cohort-ai/db";
import {
  DEFAULT_PROGRAM_CATEGORY,
  DEFAULT_PROGRAM_STATUS,
  DEFAULT_TRAINING_MODE,
  DEFAULT_CURRENCY,
  type ProgramCategory,
  type ProgramStatus,
  type TrainingMode,
} from "@/lib/products/cohort-ai/constants";

export const PROGRAMS_COLLECTION = "training_programs";
const BATCHES_COLLECTION = "training_batches";
const PROGRAM_CODE_PREFIX = "PRG";

export interface Program extends AuditFields {
  _id: string;
  programCode: string;
  name: string;
  category: ProgramCategory;
  technology: string | null;
  durationWeeks: number | null;
  mode: TrainingMode;
  fees: number | null;
  currency: string;
  description: string | null;
  learningOutcomes: string[];
  tools: string[];
  liveProjectCount: number;
  certificateIncluded: boolean;
  placementAssistance: boolean;
  status: ProgramStatus;
}

export interface SerializedProgram extends Omit<Program, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeProgram(p: Program): SerializedProgram {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Program>(PROGRAMS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ programCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ name: 1 }).catch(() => {}),
      collection.createIndex({ category: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateProgramCode(): Promise<string> {
  const seq = await nextSequence("program_code");
  return formatCode(PROGRAM_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getProgram(id: string): Promise<Program | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Lightweight list for pickers (batch / dashboard filter dropdowns). */
export async function listProgramOptions(): Promise<
  { _id: string; programCode: string; name: string; category: ProgramCategory }[]
> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { name: 1, programCode: 1, category: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, programCode: d.programCode, name: d.name, category: d.category }));
}

/** Program options with fee info — for the payment plan form. */
export async function listProgramFeeOptions(): Promise<
  { _id: string; name: string; fees: number | null; currency: string }[]
> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { name: 1, fees: 1, currency: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, name: d.name, fees: d.fees ?? null, currency: d.currency ?? "INR" }));
}

export interface ProgramFilter {
  search?: string;
  category?: ProgramCategory;
  status?: ProgramStatus;
  mode?: TrainingMode;
}

function buildFilter(opts: ProgramFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { programCode: rx }, { technology: rx }];
  }
  if (opts.category) filter.category = opts.category;
  if (opts.status) filter.status = opts.status;
  if (opts.mode) filter.mode = opts.mode;
  return filter;
}

export interface SearchProgramsOptions extends ProgramFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name" | "programCode" | "fees" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchPrograms(opts: SearchProgramsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "name"
      ? "name"
      : opts.sortBy === "programCode"
        ? "programCode"
        : opts.sortBy === "fees"
          ? "fees"
          : opts.sortBy === "status"
            ? "status"
            : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rawItems, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  // Attach a batch count per program for the directory table.
  const db = await getDb();
  const batches = db.collection(BATCHES_COLLECTION);
  const ids = rawItems.map((p) => p._id);
  const counts = ids.length
    ? await batches
        .aggregate<{ _id: string; count: number }>([
          { $match: { programId: { $in: ids }, deletedAt: null } },
          { $group: { _id: "$programId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countMap = new Map(counts.map((r) => [r._id, r.count]));
  const items = rawItems.map((p) => ({ ...p, batchCount: countMap.get(p._id) ?? 0 }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportPrograms(opts: ProgramFilter & { ids?: string[] } = {}): Promise<Program[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export async function countPrograms(filter: ProgramFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface ProgramWriteData {
  name: string;
  category: ProgramCategory;
  technology: string | null;
  durationWeeks: number | null;
  mode: TrainingMode;
  fees: number | null;
  currency: string;
  description: string | null;
  learningOutcomes: string[];
  tools: string[];
  liveProjectCount: number;
  certificateIncluded: boolean;
  placementAssistance: boolean;
  status: ProgramStatus;
}

export async function createProgram(data: ProgramWriteData, actorId: string): Promise<Program> {
  const collection = await getCollection();
  const doc: Program = {
    _id: newId(),
    programCode: await generateProgramCode(),
    name: data.name,
    category: data.category ?? DEFAULT_PROGRAM_CATEGORY,
    technology: data.technology,
    durationWeeks: data.durationWeeks,
    mode: data.mode ?? DEFAULT_TRAINING_MODE,
    fees: data.fees,
    currency: data.currency || DEFAULT_CURRENCY,
    description: data.description,
    learningOutcomes: data.learningOutcomes ?? [],
    tools: data.tools ?? [],
    liveProjectCount: data.liveProjectCount ?? 0,
    certificateIncluded: data.certificateIncluded ?? true,
    placementAssistance: data.placementAssistance ?? false,
    status: data.status ?? DEFAULT_PROGRAM_STATUS,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateProgram(
  id: string,
  data: Partial<ProgramWriteData>,
  actorId: string
): Promise<Program | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-delete. Refuses when batches still reference the program. */
export async function deleteProgram(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const db = await getDb();
  const batches = db.collection(BATCHES_COLLECTION);
  const batchCount = await batches.countDocuments({ programId: id, deletedAt: null });
  if (batchCount > 0) {
    return {
      ok: false,
      reason: `${batchCount} batch(es) still belong to this program. Remove or reassign them first.`,
    };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
