import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { formatDocNumber, MAX_NUMBER_LENGTH, periodKey } from "@/lib/products/playbook-ai/numbering-pattern";
import type { NumberingRule } from "@/lib/products/playbook-ai/pb-settings";

/**
 * Atomic document numbering (`pb_counters`, KEYED: `_id` = `<series>:<period>`).
 *
 * A number is taken just before the document is issued and GIVEN BACK if the issue then loses a race (the document changed, or someone
 * else issued it first). Given-back numbers wait in the counter's `released` list and are handed out again, lowest first, before the
 * counter moves on, so a lost race never leaves a hole. The one gap that remains is a process crash in the milliseconds between taking
 * a number and issuing the document; `releaseOutstanding` is not possible for that case because nothing records it, so it is documented
 * rather than hidden.
 */

interface Counter { _id: string; seq?: number; released?: number[] }

export interface Allocation {
  number: string;
  seq: number;
  counterId: string;
  /** Gives the number back. Safe to call more than once. */
  release(): Promise<void>;
}

async function counters() {
  return (await getDb()).collection<Counter>(PB_COLLECTIONS.counters);
}

export const counterIdFor = (rule: NumberingRule, now: Date) => `${rule.series}:${periodKey(rule.pattern, now)}`;

export async function allocateNumber(rule: NumberingRule, now: Date = new Date()): Promise<Allocation> {
  const c = await counters();
  const counterId = counterIdFor(rule, now);
  let seq: number | null = null;
  const reused = await c.findOneAndUpdate({ _id: counterId, "released.0": { $exists: true } }, { $pop: { released: -1 } }, { returnDocument: "before" });
  if (reused?.released?.length) seq = reused.released[0];
  for (let attempt = 0; seq === null; attempt++) {
    try {
      const r = await c.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
      seq = r?.seq ?? 1;
    } catch (e) {
      // Two first-ever allocations race on the upsert: one gets a duplicate key, the retry then finds the row.
      if (attempt >= 4 || (e as { code?: number }).code !== 11000) throw e;
    }
  }
  const number = formatDocNumber(rule.pattern, rule.prefix, seq, now);
  if (number.length > MAX_NUMBER_LENGTH) {
    await returnNumber(counterId, seq);
    throw new Error(`The document number "${number}" is longer than ${MAX_NUMBER_LENGTH} characters. Shorten the prefix or pattern in the settings.`);
  }
  let released = false;
  return {
    number, seq, counterId,
    release: async () => {
      if (released) return;
      released = true;
      await returnNumber(counterId, seq as number);
    },
  };
}

async function returnNumber(counterId: string, seq: number): Promise<void> {
  const c = await counters();
  await c.updateOne({ _id: counterId }, { $push: { released: { $each: [seq], $sort: 1 } } } as never);
}
