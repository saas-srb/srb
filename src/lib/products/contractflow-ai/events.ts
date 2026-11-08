import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cfEvents } from "./cf-db";
import type { EventDoc, EventType } from "./sign-types";

/**
 * The event log of a signature request. Append-only by construction: this module exports `appendEvent` and read functions and nothing that
 * updates or deletes. Each event carries the hash of the previous one, so `verifyChain` shows if any event was edited, removed or inserted.
 */

export interface NewEvent {
  requestId: string;
  signerId?: string | null;
  type: EventType;
  actorType: EventDoc["actorType"];
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: EventDoc["data"];
}

const GENESIS = "0".repeat(64);
const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);

function hashOf(e: Omit<EventDoc, "hash" | "_id">): string {
  return createHash("sha256")
    .update(JSON.stringify([e.prevHash, e.requestId, e.signerId, e.seq, e.type, e.at.toISOString(), e.actorType, e.actorId, e.ip, e.userAgent, e.data]))
    .digest("hex");
}

export async function appendEvent(input: NewEvent): Promise<EventDoc> {
  const col = await cfEvents();
  for (let attempt = 0; attempt < 6; attempt++) {
    const last = await col.find({ requestId: input.requestId }).sort({ seq: -1 }).limit(1).next();
    const body: Omit<EventDoc, "hash" | "_id"> = {
      requestId: input.requestId,
      signerId: input.signerId ?? null,
      seq: (last?.seq ?? 0) + 1,
      type: input.type,
      at: new Date(),
      actorType: input.actorType,
      actorId: clip(input.actorId, 64),
      ip: clip(input.ip, 64),
      userAgent: clip(input.userAgent, 300),
      data: input.data ?? {},
      prevHash: last?.hash ?? GENESIS,
    };
    const doc: EventDoc = { _id: randomUUID(), ...body, hash: hashOf(body) };
    try {
      await col.insertOne(doc);
      return doc;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw new Error("Could not append the event: too many concurrent writers.");
}

export async function listEvents(requestId: string): Promise<EventDoc[]> {
  return (await cfEvents()).find({ requestId }).sort({ seq: 1 }).toArray();
}

/** True when the events form an unbroken chain from the first one. */
export async function verifyChain(requestId: string): Promise<{ ok: boolean; brokenAtSeq: number | null; count: number }> {
  const events = await listEvents(requestId);
  let prev = GENESIS;
  let seq = 0;
  for (const e of events) {
    seq += 1;
    if (e.seq !== seq || e.prevHash !== prev || hashOf(e) !== e.hash) return { ok: false, brokenAtSeq: e.seq, count: events.length };
    prev = e.hash;
  }
  return { ok: true, brokenAtSeq: null, count: events.length };
}
