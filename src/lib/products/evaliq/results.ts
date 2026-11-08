import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, escapeRx } from "@/lib/products/evaliq/db";
import type { Attempt } from "@/lib/products/evaliq/attempt-types";
import type { Assignment } from "@/lib/products/evaliq/assignments";

/** Staff-side attempt listing (results + evaluation queue). */

export interface ResultFilter {
  q?: string;
  testId?: string;
  status?: string;
  result?: string;
  released?: string;
  kind?: string;
  min?: string;
  max?: string;
  from?: string;
  to?: string;
  reason?: string;
  page?: number;
  pageSize?: number;
}

export type ResultRow = Pick<Attempt, "_id" | "assignmentId" | "testId" | "testName" | "candidate" | "candidateKey" | "attemptNo" | "status" | "startedAt" | "submittedAt" | "submitReason" | "result" | "resultPublishedAt" | "violations">;

export async function listResults(f: ResultFilter) {
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (f.testId) filter.testId = f.testId;
  if (f.status) filter.status = f.status;
  else filter.status = { $ne: "in_progress" };
  if (f.result === "pass") Object.assign(filter, { status: "evaluated", "result.passed": true });
  if (f.result === "fail") Object.assign(filter, { status: "evaluated", "result.passed": false });
  if (f.released === "yes") filter.resultPublishedAt = { $ne: null };
  if (f.released === "no") filter.resultPublishedAt = null;
  if (f.kind) filter["candidate.kind"] = f.kind;
  if (f.reason) filter.submitReason = f.reason;
  const pct: Record<string, number> = {};
  if (f.min && Number.isFinite(Number(f.min))) pct.$gte = Number(f.min);
  if (f.max && Number.isFinite(Number(f.max))) pct.$lte = Number(f.max);
  if (Object.keys(pct).length) filter["result.percentage"] = pct;
  if (f.from || f.to) {
    const r: Record<string, Date> = {};
    if (f.from) r.$gte = new Date(`${f.from}T00:00:00`);
    if (f.to) r.$lte = new Date(`${f.to}T23:59:59.999`);
    filter.startedAt = r;
  }
  if (f.q?.trim()) {
    const keys = await db
      .collection<Assignment>(COLLECTIONS.assignments)
      .find({ candidateLabel: { $regex: escapeRx(f.q.trim()), $options: "i" } }, { projection: { _id: 1 } })
      .limit(2000)
      .toArray();
    filter.assignmentId = { $in: keys.map((k) => k._id) };
  }
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const col = db.collection<Attempt>(COLLECTIONS.attempts);
  const projection = { paper: 0, answers: 0, events: 0, config: 0, sections: 0 };
  const [items, total] = await Promise.all([
    col.find(filter, { projection }).sort({ submittedAt: -1, startedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray() as Promise<ResultRow[]>,
    col.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function attemptsForCandidateKeys(keys: string[]): Promise<ResultRow[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  return db
    .collection<Attempt>(COLLECTIONS.attempts)
    .find({ candidateKey: { $in: keys } }, { projection: { paper: 0, answers: 0, events: 0, config: 0, sections: 0 } })
    .sort({ startedAt: -1 })
    .limit(200)
    .toArray() as Promise<ResultRow[]>;
}
