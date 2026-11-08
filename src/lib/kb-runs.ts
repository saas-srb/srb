import "server-only";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";

export const KB_INDEX_RUNS_COLLECTION = "kb_index_runs";

export type KbRunType =
  | "website_full"
  | "website_incremental"
  | "website_page"
  | "pdf"
  | "pdf_reindex";

export type KbRunStatus = "running" | "completed" | "failed";

export interface KbRunLogEntry {
  ts: Date;
  level: "info" | "warn" | "error";
  message: string;
}

export interface KbRunStats {
  itemsTotal: number;
  itemsIndexed: number;
  itemsSkipped: number;
  itemsFailed: number;
}

export interface KbIndexRun {
  _id: ObjectId;
  type: KbRunType;
  status: KbRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  stats: KbRunStats;
  logs: KbRunLogEntry[];
  triggeredBy: string;
  error: string | null;
}

export interface SerializedKbRun extends Omit<KbIndexRun, "_id" | "startedAt" | "finishedAt" | "logs"> {
  _id: string;
  startedAt: string;
  finishedAt: string | null;
  logs: { ts: string; level: KbRunLogEntry["level"]; message: string }[];
}

let indexesEnsured = false;

async function getRunsCollection(): Promise<Collection<KbIndexRun>> {
  const db = await getDb();
  const collection = db.collection<KbIndexRun>(KB_INDEX_RUNS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ startedAt: -1 }).catch(() => {});
  }
  return collection;
}

/** A live handle to an in-progress run — accumulates logs/stats and flushes them. */
export class KbRunLogger {
  private stats: KbRunStats = { itemsTotal: 0, itemsIndexed: 0, itemsSkipped: 0, itemsFailed: 0 };
  private logs: KbRunLogEntry[] = [];

  private constructor(
    readonly id: ObjectId,
    private readonly collection: Collection<KbIndexRun>
  ) {}

  static async start(type: KbRunType, triggeredBy: string): Promise<KbRunLogger> {
    const collection = await getRunsCollection();
    const doc: KbIndexRun = {
      _id: new ObjectId(),
      type,
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      stats: { itemsTotal: 0, itemsIndexed: 0, itemsSkipped: 0, itemsFailed: 0 },
      logs: [],
      triggeredBy,
      error: null,
    };
    await collection.insertOne(doc);
    return new KbRunLogger(doc._id, collection);
  }

  log(level: KbRunLogEntry["level"], message: string): void {
    this.logs.push({ ts: new Date(), level, message: message.slice(0, 500) });
  }

  setTotal(n: number): void {
    this.stats.itemsTotal = n;
  }

  recordIndexed(): void {
    this.stats.itemsIndexed += 1;
  }
  recordSkipped(): void {
    this.stats.itemsSkipped += 1;
  }
  recordFailed(): void {
    this.stats.itemsFailed += 1;
  }

  /** Persist progress mid-run (so the admin UI can show it live). */
  async flush(): Promise<void> {
    await this.collection.updateOne(
      { _id: this.id },
      { $set: { stats: this.stats, logs: this.logs.slice(-200) } }
    );
  }

  async finish(status: Exclude<KbRunStatus, "running">, error?: string): Promise<void> {
    await this.collection.updateOne(
      { _id: this.id },
      {
        $set: {
          status,
          finishedAt: new Date(),
          stats: this.stats,
          logs: this.logs.slice(-200),
          error: error ?? null,
        },
      }
    );
  }
}

function serializeRun(doc: KbIndexRun): SerializedKbRun {
  return {
    ...doc,
    _id: String(doc._id),
    startedAt: new Date(doc.startedAt).toISOString(),
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    logs: (doc.logs ?? []).map((l) => ({
      ts: new Date(l.ts).toISOString(),
      level: l.level,
      message: l.message,
    })),
  };
}

export async function listKbRuns(limit = 20): Promise<SerializedKbRun[]> {
  const collection = await getRunsCollection();
  const docs = await collection.find({}).sort({ startedAt: -1 }).limit(limit).toArray();
  return docs.map(serializeRun);
}

export async function getLatestKbRun(type?: KbRunType): Promise<SerializedKbRun | null> {
  const collection = await getRunsCollection();
  const doc = await collection.findOne(type ? { type } : {}, { sort: { startedAt: -1 } });
  return doc ? serializeRun(doc) : null;
}

/** Mark runs that have been "running" for over an hour as failed (crash recovery). */
export async function reapStaleRuns(): Promise<void> {
  const collection = await getRunsCollection();
  await collection
    .updateMany(
      { status: "running", startedAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } },
      { $set: { status: "failed", finishedAt: new Date(), error: "Run timed out or the process restarted." } }
    )
    .catch(() => {});
}
