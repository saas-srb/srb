import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, createStamp, newId, notDeleted, updateStamp, type AuditFields } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";

/** Test and question categories (two independent lists, one collection keyed by `kind`). */

export type CategoryKind = "test" | "question";

export interface Category extends AuditFields {
  _id: string;
  kind: CategoryKind;
  name: string;
  description: string;
}

export interface CategoryRow extends Category {
  usage: number;
}

export async function listCategories(kind: CategoryKind): Promise<Category[]> {
  const db = await getDb();
  return db.collection<Category>(COLLECTIONS.categories).find({ kind, ...notDeleted }).sort({ name: 1 }).toArray();
}

export async function listCategoriesWithUsage(kind: CategoryKind): Promise<CategoryRow[]> {
  const db = await getDb();
  const cats = await listCategories(kind);
  const counts = await db
    .collection(kind === "test" ? COLLECTIONS.tests : COLLECTIONS.questions)
    .aggregate<{ _id: string; n: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$categoryId", n: { $sum: 1 } } }])
    .toArray();
  const byId = new Map(counts.map((c) => [c._id, c.n]));
  return cats.map((c) => ({ ...c, usage: byId.get(c._id) ?? 0 }));
}

export async function categoryMap(kind: CategoryKind): Promise<Map<string, string>> {
  return new Map((await listCategories(kind)).map((c) => [c._id, c.name]));
}

function clean(input: { name?: unknown; description?: unknown }) {
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new OtsInputError("Give the category a name.");
  return { name, description: String(input.description ?? "").trim().slice(0, 300) };
}

async function assertUnique(kind: CategoryKind, name: string, exceptId?: string) {
  const db = await getDb();
  const dup = await db.collection<Category>(COLLECTIONS.categories).findOne({
    kind,
    ...notDeleted,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (dup) throw new OtsInputError(`A ${kind} category called "${dup.name}" already exists.`);
}

export async function createCategory(kind: CategoryKind, input: { name?: unknown; description?: unknown }, actorId: string): Promise<Category> {
  const data = clean(input);
  await assertUnique(kind, data.name);
  const doc: Category = { _id: newId(), kind, ...data, ...createStamp(actorId) };
  const db = await getDb();
  await db.collection<Category>(COLLECTIONS.categories).insertOne(doc);
  return doc;
}

export async function updateCategory(id: string, input: { name?: unknown; description?: unknown }, actorId: string): Promise<Category> {
  const db = await getDb();
  const col = db.collection<Category>(COLLECTIONS.categories);
  const cur = await col.findOne({ _id: id, ...notDeleted });
  if (!cur) throw new NotFoundError();
  const data = clean(input);
  await assertUnique(cur.kind, data.name, id);
  await col.updateOne({ _id: id }, { $set: { ...data, ...updateStamp(actorId) } });
  return { ...cur, ...data };
}

export async function deleteCategory(id: string, actorId: string): Promise<Category> {
  const db = await getDb();
  const col = db.collection<Category>(COLLECTIONS.categories);
  const cur = await col.findOne({ _id: id, ...notDeleted });
  if (!cur) throw new NotFoundError();
  const used = await db.collection(cur.kind === "test" ? COLLECTIONS.tests : COLLECTIONS.questions).countDocuments({ categoryId: id, deletedAt: null });
  if (used > 0) throw new OtsInputError(`"${cur.name}" is used by ${used} ${cur.kind === "test" ? "test" : "question"}${used === 1 ? "" : "s"} — move them to another category first.`);
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return cur;
}
