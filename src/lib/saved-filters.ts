import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

export interface SavedFilter {
  _id: ObjectId;
  adminId: ObjectId;
  name: string;
  params: Record<string, string>;
  createdAt: Date;
}

async function getSavedFiltersCollection() {
  const db = await getDb();
  return db.collection<Omit<SavedFilter, "_id">>("admin_saved_filters");
}

export async function listSavedFilters(adminId: string): Promise<SavedFilter[]> {
  const collection = await getSavedFiltersCollection();
  const docs = await collection
    .find({ adminId: new ObjectId(adminId) })
    .sort({ createdAt: -1 })
    .toArray();
  return docs as SavedFilter[];
}

export async function createSavedFilter(adminId: string, name: string, params: Record<string, string>): Promise<string> {
  const collection = await getSavedFiltersCollection();
  const result = await collection.insertOne({
    adminId: new ObjectId(adminId),
    name: name.trim().slice(0, 60),
    params,
    createdAt: new Date(),
  });
  return String(result.insertedId);
}

export async function deleteSavedFilter(adminId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await getSavedFiltersCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(id), adminId: new ObjectId(adminId) });
  return result.deletedCount === 1;
}
