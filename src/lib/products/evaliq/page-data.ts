import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/evaliq/db";
import { can, type OtsViewer } from "@/lib/products/evaliq/viewer";
import { candidateKey } from "@/lib/products/evaliq/constants";

/** Small counts for the sidebar badges. */
export async function navCounts(v: OtsViewer): Promise<{ myOpen: number; toEvaluate: number }> {
  const db = await getDb();
  const [myOpen, toEvaluate] = await Promise.all([
    can(v, "TAKE_TEST") ? db.collection(COLLECTIONS.assignments).countDocuments({ candidateKey: { $in: v.candidates.map(candidateKey) }, status: { $in: ["assigned", "in_progress"] }, deletedAt: null }) : 0,
    can(v, "EVALUATE_ANSWERS") ? db.collection(COLLECTIONS.attempts).countDocuments({ status: "pending_evaluation" }) : 0,
  ]);
  return { myOpen, toEvaluate };
}
