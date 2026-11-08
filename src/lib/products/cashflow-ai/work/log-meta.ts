import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { WORK_LOG_COLLECTION, type WorkLogDoc } from "@/lib/products/cashflow-ai/work/store";

/** Who marked a piece of work done or skipped, and when (for the "done by" line). */
export async function loadWorkLogMeta(taskId: string, periodKey: string): Promise<{ by: string | null; at: string | null } | null> {
  const db = await getDb();
  const row = await db.collection<WorkLogDoc>(WORK_LOG_COLLECTION).findOne({ taskId, periodKey, ...notDeleted });
  if (!row || row.status === "open") return null;
  let by: string | null = null;
  if (row.doneBy && ObjectId.isValid(row.doneBy)) {
    const u = await db.collection<{ _id: ObjectId; email?: string; name?: string }>("admin_users").findOne({ _id: new ObjectId(row.doneBy) }, { projection: { email: 1, name: 1 } });
    by = u?.name || u?.email || null;
  }
  return { by, at: row.doneAt ? row.doneAt.toISOString() : null };
}
