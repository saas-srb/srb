import "server-only";
import { getDb } from "@/lib/mongodb";

/**
 * Lightweight cross-module picker reads for the transaction form. Mirrors
 * `src/lib/spendiq/pickers.ts`'s own precedent of reading another module's
 * collection directly for a read-only, projection-only dropdown list — this
 * is not duplicating master data (nothing is written), just a picker.
 */

export interface ProjectOption {
  _id: string;
  name: string;
  projectCode: string;
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  const db = await getDb();
  const docs = await db
    .collection<{ _id: string; name?: string; projectCode?: string }>("pms_projects")
    .find({ deletedAt: null }, { projection: { name: 1, projectCode: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({
    _id: d._id,
    name: d.name ?? "(untitled project)",
    projectCode: d.projectCode ?? "",
  }));
}
