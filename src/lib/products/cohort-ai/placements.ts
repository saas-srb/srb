import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cohort-ai/db";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import {
  PLACEMENT_TYPES,
  isValidPlacementType,
  getPlacementTypeLabel,
  type PlacementType,
} from "@/lib/products/cohort-ai/constants";

export const PLACEMENTS_COLLECTION = "placement_records";
const STUDENTS_COLLECTION = "training_students";

export { PLACEMENT_TYPES, isValidPlacementType, getPlacementTypeLabel };
export type { PlacementType };

export interface PlacementRecord extends AuditFields {
  _id: string;
  studentId: string;
  programId: string | null;
  company: string;
  role: string;
  /** Annual CTC in the currency's minor-agnostic units (store as entered). */
  packageLpa: number | null;
  location: string | null;
  type: PlacementType;
  placedOn: string; // ISO yyyy-mm-dd
  offerLetterUrl: string | null;
  notes: string | null;
}

export interface SerializedPlacementRecord extends Omit<PlacementRecord, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializePlacement(p: PlacementRecord): SerializedPlacementRecord {
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
  const collection = db.collection<PlacementRecord>(PLACEMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ studentId: 1 }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ placedOn: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function getPlacement(id: string): Promise<PlacementRecord | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface PlacementView extends PlacementRecord {
  studentName: string;
  studentCode: string | null;
  programName: string | null;
  typeLabel: string;
}

async function attachMeta(rows: PlacementRecord[]): Promise<PlacementView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const [students, programs] = await Promise.all([
    db.collection<{ _id: string; fullName: string; studentCode: string }>(STUDENTS_COLLECTION).find({ _id: { $in: rows.map((r) => r.studentId) } }, { projection: { fullName: 1, studentCode: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: rows.map((r) => r.programId).filter(Boolean) as string[] } }, { projection: { name: 1 } }).toArray(),
  ]);
  const studentById = new Map(students.map((s) => [s._id, s]));
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  return rows.map((r) => ({
    ...r,
    studentName: studentById.get(r.studentId)?.fullName ?? "Unknown student",
    studentCode: studentById.get(r.studentId)?.studentCode ?? null,
    programName: r.programId ? programName.get(r.programId) ?? null : null,
    typeLabel: getPlacementTypeLabel(r.type),
  }));
}

export async function listPlacements(
  opts: { programId?: string; type?: PlacementType; studentId?: string } = {},
  limit = 800
): Promise<PlacementView[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.programId) filter.programId = opts.programId;
  if (opts.type) filter.type = opts.type;
  if (opts.studentId) filter.studentId = opts.studentId;
  const rows = await collection.find(filter).sort({ placedOn: -1 }).limit(limit).toArray();
  return attachMeta(rows);
}

export async function countPlacements(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(notDeleted);
}

export interface PlacementWriteData {
  studentId: string;
  programId: string | null;
  company: string;
  role: string;
  packageLpa: number | null;
  location: string | null;
  type: PlacementType;
  placedOn: string;
  offerLetterUrl: string | null;
  notes: string | null;
}

export async function createPlacement(data: PlacementWriteData, actorId: string): Promise<PlacementRecord> {
  const collection = await getCollection();
  const doc: PlacementRecord = { _id: newId(), ...data, ...createStamp(actorId) };
  await collection.insertOne(doc);
  return doc;
}

export async function updatePlacement(id: string, data: Partial<PlacementWriteData>, actorId: string): Promise<PlacementRecord | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } }, { returnDocument: "after" });
}

export async function deletePlacement(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return res.modifiedCount === 1;
}
