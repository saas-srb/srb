import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, nextSequence } from "@/lib/products/huddle-ai/db";
import { scopeKey, type EventScope } from "@/lib/products/huddle-ai/event-key";

export { scopeKey };
export type { EventScope };

/**
 * The realtime backbone. Every user-visible change in Messenger (a new message,
 * an edit, a reaction, a read receipt, a typing ping, a presence change, a
 * notification) is appended here as an ordered event. The SSE route
 * (`/api/huddle-ai/stream`) tails this collection on a monotonic `seq` cursor
 * and pushes new events to each connected client, filtered to the scopes that
 * client is a member of.
 *
 * Deliberately transport-agnostic: swapping SSE for a real WebSocket server
 * later means reimplementing `src/app/api/huddle-ai/stream/route.ts` only —
 * `emit()` / `pull()` stay exactly as they are.
 *
 * No MongoDB change streams / replica set required — ordering comes from the
 * `chat_counters` sequence, tailing is a plain indexed range query.
 */

export const EVENTS_COLLECTION = "chat_events";
const SEQ_NAME = "chat_event";

export type EventKind =
  | "message" // a new message was posted
  | "message_edit" // an existing message body/attachments changed
  | "message_delete" // a message was soft-deleted
  | "reaction" // a reaction was added or removed
  | "read" // a participant's read cursor advanced
  | "typing" // someone is composing (ephemeral)
  | "presence" // a user's presence status changed
  | "channel" // channel created / updated / member list changed
  | "notification" // a personal notification was raised
  | "call_ring" // an incoming call is ringing (emitted to user:<id>)
  | "call_state" // call roster / hands / presenter / lifecycle changed
  | "call_signal"; // WebRTC signaling payload (offer/answer/ice/bye)

export interface ChatEvent {
  _id: string;
  seq: number;
  scopeKey: string;
  kind: EventKind;
  payload: Record<string, unknown>;
  actorId: string | null;
  createdAt: Date;
  /** Only set for ephemeral kinds (`typing`) — TTL-swept. */
  expiresAt?: Date;
}

export interface SerializedChatEvent extends Omit<ChatEvent, "createdAt" | "expiresAt"> {
  createdAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ChatEvent>(EVENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ scopeKey: 1, seq: 1 }).catch(() => {}),
      collection.createIndex({ seq: 1 }).catch(() => {}),
      // Ephemeral (typing) events self-clean. Non-ephemeral events have no
      // `expiresAt` and are retained (they are also individually small).
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
      // Bounded retention for the durable log so it can't grow without limit —
      // 45 days of history is far more than any client rewinds.
      collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 45 * 86400 }).catch(() => {}),
    ]);
  }
  return collection;
}

export interface EmitInput {
  scope: EventScope;
  kind: EventKind;
  payload?: Record<string, unknown>;
  actorId?: string | null;
  /** Seconds until the event self-deletes — for `typing` only. */
  ttlSeconds?: number;
}

/** Append one event. Best-effort — never throws (realtime is not a hard dependency of a write succeeding). */
export async function emit(input: EmitInput): Promise<void> {
  try {
    const collection = await getCollection();
    const seq = await nextSequence(SEQ_NAME);
    const doc: ChatEvent = {
      _id: newId(),
      seq,
      scopeKey: scopeKey(input.scope),
      kind: input.kind,
      payload: input.payload ?? {},
      actorId: input.actorId ?? null,
      createdAt: new Date(),
    };
    if (input.ttlSeconds && input.ttlSeconds > 0) {
      doc.expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    }
    await collection.insertOne(doc);
  } catch {
    // realtime delivery is best-effort
  }
}

/** Append several events (fan-out — e.g. one channel event + a notification per mentioned user). */
export async function emitMany(inputs: EmitInput[]): Promise<void> {
  await Promise.all(inputs.map(emit));
}

/** The current head of the log — clients open their stream "from now" with this. */
export async function latestSeq(): Promise<number> {
  try {
    const collection = await getCollection();
    const top = await collection.find({}).sort({ seq: -1 }).limit(1).next();
    return top?.seq ?? 0;
  } catch {
    return 0;
  }
}

export interface PullInput {
  scopeKeys: string[];
  afterSeq: number;
  limit?: number;
}

/** Ordered events for the given scopes with `seq > afterSeq`. */
export async function pull(input: PullInput): Promise<ChatEvent[]> {
  if (input.scopeKeys.length === 0) return [];
  const collection = await getCollection();
  return collection
    .find({ scopeKey: { $in: input.scopeKeys }, seq: { $gt: input.afterSeq } })
    .sort({ seq: 1 })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500))
    .toArray();
}

export function serializeEvent(e: ChatEvent): SerializedChatEvent {
  return {
    _id: e._id,
    seq: e.seq,
    scopeKey: e.scopeKey,
    kind: e.kind,
    payload: e.payload,
    actorId: e.actorId,
    createdAt: e.createdAt.toISOString(),
  };
}
