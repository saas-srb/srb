import "server-only";
import { createHmac } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { CALL_COLLECTIONS, type CallDoc, type DoNotCallDoc, type PhoneNumberDoc } from "@/lib/products/agentos/calls/types";

/** Collection accessors for the calling engine. Indexes are created once per process, on first use. */

let indexed = false;
let indexing: Promise<void> | null = null;
/** Indexes whose absence is unsafe: a missing unique index lets a double click place two calls. A failure here stops the caller. */
const CRITICAL = new Set(["idempotency", "conversation"]);

type IndexSpec = { name: string; collection: string; keys: Record<string, 1 | -1>; options?: Record<string, unknown> };
const INDEXES: IndexSpec[] = [
  { name: "idempotency", collection: CALL_COLLECTIONS.calls, keys: { idempotencyKey: 1 }, options: { unique: true } },
  { name: "status", collection: CALL_COLLECTIONS.calls, keys: { status: 1, scheduledFor: 1 } },
  { name: "target", collection: CALL_COLLECTIONS.calls, keys: { "target.product": 1, "target.entityType": 1, "target.entityId": 1, createdAt: -1 } },
  { name: "agent", collection: CALL_COLLECTIONS.calls, keys: { agentId: 1, createdAt: -1 } },
  { name: "phone", collection: CALL_COLLECTIONS.calls, keys: { phoneHash: 1, anchorAt: 1 } },
  { name: "dialed", collection: CALL_COLLECTIONS.calls, keys: { dialedAt: 1 } },
  { name: "conversation", collection: CALL_COLLECTIONS.calls, keys: { conversationId: 1 }, options: { unique: true, partialFilterExpression: { conversationId: { $type: "string" } } } },
  { name: "number", collection: CALL_COLLECTIONS.phoneNumbers, keys: { number: 1 }, options: { unique: true } },
  { name: "dnc", collection: CALL_COLLECTIONS.doNotCall, keys: { phoneHash: 1 }, options: { unique: true } },
  { name: "settings", collection: CALL_COLLECTIONS.settings, keys: { kind: 1 }, options: { unique: true } },
];

type IndexDb = { collection(name: string): { createIndex(keys: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<unknown> } };
let dbForIndexes: (() => Promise<IndexDb>) | null = null;

/**
 * Creates the indexes and marks them done ONLY when creation succeeded. A failure is logged and retried on the next call; a failure of a
 * unique index (idempotency, conversation id ...) is thrown, so nothing is inserted without the guarantee it relies on.
 * Concurrent first calls share one attempt.
 */
async function ensureIndexes(): Promise<void> {
  if (indexed) return;
  if (!indexing) {
    indexing = (async () => {
      const db = await (dbForIndexes ?? (getDb as () => Promise<IndexDb>))();
      const results = await Promise.allSettled(INDEXES.map((i) => db.collection(i.collection).createIndex(i.keys, i.options)));
      let critical: unknown = null;
      let failed = false;
      results.forEach((r, n) => {
        if (r.status === "fulfilled") return;
        failed = true;
        const spec = INDEXES[n];
        console.error(`[agentos calls] ${spec.name} index failed`, r.reason instanceof Error ? r.reason.message : r.reason);
        if (CRITICAL.has(spec.name)) critical ??= r.reason;
      });
      if (!failed) indexed = true;
      if (critical) throw critical instanceof Error ? critical : new Error("A required call index could not be created.");
    })().finally(() => {
      indexing = null;
    });
  }
  await indexing;
}

export async function callsCollection() {
  await ensureIndexes();
  return (await getDb()).collection<CallDoc>(CALL_COLLECTIONS.calls);
}
export async function numbersCollection() {
  await ensureIndexes();
  return (await getDb()).collection<PhoneNumberDoc>(CALL_COLLECTIONS.phoneNumbers);
}
export async function dncCollection() {
  await ensureIndexes();
  return (await getDb()).collection<DoNotCallDoc>(CALL_COLLECTIONS.doNotCall);
}
export async function settingsCollection() {
  await ensureIndexes();
  return (await getDb()).collection<{ _id: string; kind: "main" } & Record<string, unknown>>(CALL_COLLECTIONS.settings);
}

/** Test hook: forget that indexes exist (a test drops its database between runs). */
export function resetCallIndexes(): void {
  indexed = false;
  indexing = null;
}
/** Test hook: the database the indexes are created on (null = the real one). */
export function setIndexDbForTest(db: (() => Promise<IndexDb>) | null): void {
  dbForIndexes = db;
  indexed = false;
  indexing = null;
}
/** Test hook. */
export const callIndexesReady = () => indexed;
export { ensureIndexes as ensureCallIndexes };

/**
 * A stable, non-reversible fingerprint of a phone number for lookups (do-not-call list, duplicate window), bound to the company.
 * Keyed with the platform encryption key when it is set, so a leaked fingerprint list can't be brute-forced across companies.
 */
export async function phoneFingerprint(e164: string): Promise<string> {
  const companyId = await currentCompanyId();
  return createHmac("sha256", `${process.env.PLATFORM_ENCRYPTION_KEY ?? ""}:agentos-phone:${companyId}`).update(e164).digest("hex");
}

export const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
