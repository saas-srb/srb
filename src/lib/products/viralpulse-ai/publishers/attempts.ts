import "server-only";
import { randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ErrorClass, PlatformKey, AttemptStepData } from "./types";

/**
 * `smms_publish_attempts`: one document per (post, platform, round). It is the state machine, the lease, the resume point and the
 * audit trail of a publish. The unique `idempotencyKey` (`postId:platform:round`) is what makes a double click, an overlapping cron run
 * or a serverless double-invoke unable to create two publishes. Tenant isolation: `getDb()` is company-scoped like every other SMMS collection.
 */

export const ATTEMPTS = "smms_publish_attempts";
export type AttemptState = "queued" | "uploading" | "processing" | "published" | "failed" | "cancelled";
export const ACTIVE_STATES: AttemptState[] = ["queued", "uploading", "processing"];
export const LEASE_MS = 5 * 60_000;

export interface AttemptHistory {
  at: Date;
  state: AttemptState;
  note: string;
}

export interface AttemptDoc {
  _id: string;
  postId: string;
  platform: PlatformKey;
  accountId: string | null;
  round: number;
  idempotencyKey: string;
  state: AttemptState;
  mode: "now" | "scheduled";
  scheduledFor: Date | null;
  requestedBy: string | null;
  /** Adapter progress: container ids, upload session, uploaded media ids ... Never contains tokens. */
  data: AttemptStepData;
  /** The one non-idempotent call was started; a resume must reconcile before sending again. */
  committed: boolean;
  externalId: string | null;
  url: string | null;
  extraIds: Record<string, string> | null;
  warnings: string[];
  errorClass: ErrorClass | null;
  errorCode: string | null;
  message: string | null;
  hint: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseUntil: Date | null;
  leaseOwner: string | null;
  cancelRequested: boolean;
  requestIds: string[];
  disclosure: { mode: string; nativeFlag: boolean; reason: string } | null;
  history: AttemptHistory[];
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

let indexing: Promise<unknown> | null = null;
export async function attemptsCol() {
  const db = await getDb();
  const col = db.collection<AttemptDoc>(ATTEMPTS);
  // Every caller waits for the (unique) indexes, so the first concurrent inserts cannot slip in before idempotencyKey is enforced.
  indexing ??= Promise.all([
    col.createIndex({ idempotencyKey: 1 }, { unique: true }),
    col.createIndex({ state: 1, nextAttemptAt: 1 }),
    col.createIndex({ postId: 1, platform: 1, round: -1 }),
    col.createIndex({ platform: 1, accountId: 1, startedAt: -1 }),
  ]).catch((e) => {
    indexing = null;
    throw e;
  });
  await indexing;
  return col;
}
export function resetAttemptIndexCacheForTests() {
  indexing = null;
}

export class LeaseLostError extends Error {
  constructor(readonly cancelled = false) {
    super(cancelled ? "Publishing was cancelled." : "This publish is being handled by another worker.");
    this.name = "LeaseLostError";
  }
}

const hist = (state: AttemptState, note: string): AttemptHistory => ({ at: new Date(), state, note: note.slice(0, 200) });

export interface NewAttempt {
  postId: string;
  platform: PlatformKey;
  accountId?: string | null;
  mode: "now" | "scheduled";
  scheduledFor?: Date | null;
  requestedBy?: string | null;
  maxAttempts?: number;
  /** Start a new round even if an earlier one failed (discards its resume data). */
  fresh?: boolean;
}

/**
 * Finds or creates the attempt for a post+platform. Published -> returned as-is (duplicate protection). Active -> returned as-is
 * (a second click joins the first). Failed -> returned so the retry resumes with its data. `fresh` starts round+1.
 */
export async function ensureAttempt(n: NewAttempt): Promise<{ attempt: AttemptDoc; created: boolean }> {
  const col = await attemptsCol();
  const latest = await col.find({ postId: n.postId, platform: n.platform }).sort({ round: -1 }).limit(1).next();
  if (latest && latest.state !== "cancelled" && !(n.fresh && latest.state === "failed")) return { attempt: latest, created: false };
  const round = latest ? latest.round + 1 : 1;
  const now = new Date();
  const doc: AttemptDoc = {
    _id: randomUUID(),
    postId: n.postId,
    platform: n.platform,
    accountId: n.accountId ?? null,
    round,
    idempotencyKey: `${n.postId}:${n.platform}:${round}`,
    state: "queued",
    mode: n.mode,
    scheduledFor: n.scheduledFor ?? null,
    requestedBy: n.requestedBy ?? null,
    data: {},
    committed: false,
    externalId: null,
    url: null,
    extraIds: null,
    warnings: [],
    errorClass: null,
    errorCode: null,
    message: null,
    hint: null,
    attempts: 0,
    maxAttempts: n.maxAttempts ?? 5,
    nextAttemptAt: now,
    leaseUntil: null,
    leaseOwner: null,
    cancelRequested: false,
    requestIds: [],
    disclosure: null,
    history: [hist("queued", n.mode === "now" ? "Publish now" : "Scheduled")],
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  try {
    await col.insertOne(doc);
    return { attempt: doc, created: true };
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    const again = await col.findOne({ idempotencyKey: doc.idempotencyKey });
    if (!again) throw e;
    return { attempt: again, created: false };
  }
}

/** Atomically takes the lease on one attempt when it is due and nobody holds it. */
export async function claimAttempt(id: string, owner: string, now = new Date(), opts: { ignoreSchedule?: boolean } = {}): Promise<AttemptDoc | null> {
  const col = await attemptsCol();
  const filter: Filter<AttemptDoc> = {
    _id: id,
    state: { $in: ACTIVE_STATES },
    cancelRequested: false,
    $and: [{ $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] }, ...(opts.ignoreSchedule ? [] : [{ $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] }])],
  };
  return col.findOneAndUpdate(filter, { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now, startedAt: now } }, { returnDocument: "after" });
}

/** Claims up to `limit` due attempts (any post), oldest first. Safe to run from several workers at once. */
export async function claimDue(limit: number, owner: string, now = new Date()): Promise<AttemptDoc[]> {
  const col = await attemptsCol();
  const out: AttemptDoc[] = [];
  for (let i = 0; i < limit; i++) {
    const got = await col.findOneAndUpdate(
      { state: { $in: ACTIVE_STATES }, cancelRequested: false, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] },
      { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now } },
      { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
    );
    if (!got) break;
    out.push(got);
  }
  return out;
}

/** Saves adapter progress and extends the lease. Throws LeaseLostError if the lease was lost or cancel was requested. */
export async function saveProgress(id: string, owner: string, patch: AttemptStepData, extra: Partial<Pick<AttemptDoc, "committed" | "state">> & { requestId?: string | null } = {}): Promise<void> {
  const col = await attemptsCol();
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS) };
  const unset: Record<string, ""> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) unset[`data.${k}`] = "";
    else set[`data.${k}`] = v;
  }
  if (extra.committed !== undefined) set.committed = extra.committed;
  if (extra.state) set.state = extra.state;
  const res = await col.updateOne(
    { _id: id, leaseOwner: owner, state: { $in: ACTIVE_STATES } },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), ...(extra.requestId ? { $addToSet: { requestIds: extra.requestId } } : {}) },
  );
  if (res.matchedCount === 0) {
    const cur = await col.findOne({ _id: id }, { projection: { cancelRequested: 1, state: 1 } });
    throw new LeaseLostError(Boolean(cur?.cancelRequested || cur?.state === "cancelled"));
  }
}

export interface Settle {
  state: AttemptState;
  note: string;
  externalId?: string | null;
  url?: string | null;
  extraIds?: Record<string, string> | null;
  warnings?: string[];
  errorClass?: ErrorClass | null;
  errorCode?: string | null;
  message?: string | null;
  hint?: string | null;
  nextAttemptAt?: Date | null;
  countFailure?: boolean;
  clearCommit?: boolean;
  disclosure?: AttemptDoc["disclosure"];
}

/** Final or intermediate state change; releases the lease. */
export async function settle(id: string, owner: string, s: Settle): Promise<AttemptDoc | null> {
  const col = await attemptsCol();
  const now = new Date();
  const terminal = s.state === "published" || s.state === "failed" || s.state === "cancelled";
  return col.findOneAndUpdate(
    { _id: id, leaseOwner: owner },
    {
      $set: {
        state: s.state,
        updatedAt: now,
        leaseUntil: null,
        leaseOwner: null,
        nextAttemptAt: s.nextAttemptAt ?? null,
        errorClass: s.errorClass ?? null,
        errorCode: s.errorCode ?? null,
        message: s.message ?? null,
        hint: s.hint ?? null,
        ...(s.externalId !== undefined ? { externalId: s.externalId } : {}),
        ...(s.url !== undefined ? { url: s.url } : {}),
        ...(s.extraIds !== undefined ? { extraIds: s.extraIds } : {}),
        ...(s.warnings ? { warnings: s.warnings } : {}),
        ...(s.disclosure !== undefined ? { disclosure: s.disclosure } : {}),
        ...(s.clearCommit ? { committed: false } : {}),
        ...(terminal ? { finishedAt: now } : {}),
      },
      ...(s.countFailure ? { $inc: { attempts: 1 } } : {}),
      $push: { history: { $each: [hist(s.state, s.note)], $slice: -30 } },
    },
    { returnDocument: "after" },
  );
}

/** Re-opens a failed attempt for an explicit retry. `force` also clears the "may already be published" marker. */
export async function reopen(id: string, opts: { force?: boolean; note?: string } = {}): Promise<AttemptDoc | null> {
  const col = await attemptsCol();
  const now = new Date();
  return col.findOneAndUpdate(
    { _id: id, state: "failed" },
    {
      $set: { state: "queued", nextAttemptAt: now, attempts: 0, errorClass: null, errorCode: null, message: null, hint: null, finishedAt: null, updatedAt: now, ...(opts.force ? { committed: false } : {}) },
      $push: { history: { $each: [hist("queued", opts.note ?? "Retry requested")], $slice: -30 } },
    },
    { returnDocument: "after" },
  );
}

/** Cancels attempts that have not published. Leased ones stop at their next checkpoint. */
export async function cancelAttempts(postId: string, platform?: PlatformKey): Promise<number> {
  const col = await attemptsCol();
  const now = new Date();
  const filter: Filter<AttemptDoc> = { postId, state: { $in: ACTIVE_STATES }, ...(platform ? { platform } : {}) };
  await col.updateMany({ ...filter, leaseUntil: { $gt: now } }, { $set: { cancelRequested: true, updatedAt: now } });
  const r = await col.updateMany({ ...filter, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { state: "cancelled", cancelRequested: true, finishedAt: now, updatedAt: now, nextAttemptAt: null }, $push: { history: { $each: [hist("cancelled", "Cancelled")], $slice: -30 } } });
  return r.modifiedCount;
}

export async function attemptsForPost(postId: string): Promise<AttemptDoc[]> {
  return (await attemptsCol()).find({ postId }).sort({ createdAt: -1 }).limit(100).toArray();
}

/** Attempts that started in the last 24 h for an account - the provider's rolling-window budget. */
export async function countRecentStarts(platform: PlatformKey, accountId: string | null, since: Date): Promise<{ count: number; oldest: Date | null }> {
  const col = await attemptsCol();
  const rows = await col.find({ platform, accountId, $or: [{ state: "published", finishedAt: { $gte: since } }, { state: { $in: ["uploading", "processing"] }, startedAt: { $gte: since } }] }, { projection: { finishedAt: 1, startedAt: 1 } }).sort({ finishedAt: 1 }).toArray();
  return { count: rows.length, oldest: rows[0] ? (rows[0].finishedAt ?? rows[0].startedAt) : null };
}
