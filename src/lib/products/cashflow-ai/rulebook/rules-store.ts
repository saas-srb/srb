import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { builtinRulebook, validateRulebook, type RulebookEntry, type TaxRulebook } from "@/lib/products/cashflow-ai/rulebook/rules";

/**
 * The tax rulebook as the platform publishes it (`tax_rulebook`, one document per financial year). Every company reads the same figures, so when the
 * law changes a platform administrator updates one document and every company's next screen uses it, with no deployment and nothing typed by a
 * company. A year with no published document uses the built-in starting table, which is always unconfirmed. Saving stores a new version as
 * unconfirmed; an administrator then checks it against the notification and confirms it.
 */
const COLLECTION = "tax_rulebook";

interface Doc {
  _id: string;
  fy: string;
  data: TaxRulebook;
  confirmed: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  version: number;
  updatedAt: Date;
  updatedBy: string;
  history: { version: number; at: Date; by: string; action: "save" | "confirm" | "reset" }[];
}

const g = globalThis as unknown as { __taxRulebook?: Map<string, { at: number; value: RulebookEntry }> };
const col = async () => (await getPlatformDb()).collection<Doc>(COLLECTION);
export const forgetRulebook = () => {
  g.__taxRulebook = undefined;
};

function toEntry(fy: string, d: Doc | null): RulebookEntry {
  if (!d) return { ...builtinRulebook(fy), confirmed: false, confirmedAt: null, confirmedBy: null, origin: "built-in" };
  return { ...d.data, fy, confirmed: d.confirmed, confirmedAt: d.confirmedAt?.toISOString() ?? null, confirmedBy: d.confirmedBy, origin: "published" };
}

/** The rulebook in force for a financial year. A database problem falls back to the built-in table (unconfirmed) rather than stopping a page. */
export async function loadRulebook(fy: string): Promise<RulebookEntry> {
  const cache = (g.__taxRulebook ??= new Map());
  const hit = cache.get(fy);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value: RulebookEntry;
  try {
    value = toEntry(fy, await (await col()).findOne({ _id: fy }));
  } catch (err) {
    console.error("[tax-rulebook] could not read the published table; using the built-in one", err instanceof Error ? err.message : err);
    value = toEntry(fy, null);
  }
  cache.set(fy, { at: Date.now(), value });
  return value;
}

export interface RulebookListing {
  fy: string;
  origin: "built-in" | "published";
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
  source: string;
}

/** Published years plus the years around today that only have the built-in table, newest first. */
export async function listRulebooks(aroundFy: string): Promise<RulebookListing[]> {
  const docs = await (await col()).find({}).toArray();
  const byFy = new Map(docs.map((d) => [d._id, d]));
  const y = Number(aroundFy.slice(0, 4));
  for (const yy of [y - 1, y, y + 1]) {
    const fy = `${yy}-${String((yy + 1) % 100).padStart(2, "0")}`;
    if (!byFy.has(fy)) byFy.set(fy, null as unknown as Doc);
  }
  return [...byFy.entries()]
    .map(([fy, d]) => {
      const e = toEntry(fy, d);
      return { fy, origin: e.origin, confirmed: e.confirmed, confirmedBy: e.confirmedBy, confirmedAt: e.confirmedAt, version: d?.version ?? 0, source: e.source };
    })
    .sort((a, b) => (a.fy < b.fy ? 1 : -1));
}

type Actor = { id: string; email: string };
export type SaveResult = { ok: true; version: number } | { ok: false; errors: string[] };

/** Publishes a year's table. `confirm` also marks it checked (the administrator saved figures they have verified). */
export async function saveRulebook(fy: string, data: TaxRulebook, confirm: boolean, actor: Actor): Promise<SaveResult> {
  const clean: TaxRulebook = { ...data, fy };
  const errors = validateRulebook(clean);
  if (errors.length) return { ok: false, errors };
  const row = await (await col()).findOneAndUpdate(
    { _id: fy },
    {
      $inc: { version: 1 },
      $set: { fy, data: clean, confirmed: confirm, confirmedAt: confirm ? new Date() : null, confirmedBy: confirm ? actor.email : null, updatedAt: new Date(), updatedBy: actor.email },
      $push: { history: { version: 0, at: new Date(), by: actor.email, action: confirm ? "confirm" : "save" } as never },
    },
    { upsert: true, returnDocument: "after" },
  );
  forgetRulebook();
  await recordPlatformAudit({ actorId: actor.id, action: confirm ? "tax.rulebook.confirm" : "tax.rulebook.save", target: { type: "tax_rulebook", id: fy }, details: { version: row?.version ?? 1 } });
  return { ok: true, version: row?.version ?? 1 };
}

/** Marks the year's table in force (published or built-in) as checked against the notification. */
export async function confirmRulebook(fy: string, actor: Actor): Promise<SaveResult> {
  const e = await loadRulebook(fy);
  const { confirmed, confirmedAt, confirmedBy, origin, ...data } = e;
  void confirmed; void confirmedAt; void confirmedBy; void origin;
  return saveRulebook(fy, data, true, actor);
}

/** Back to the built-in starting table. */
export async function resetRulebook(fy: string, actor: Actor): Promise<{ ok: true }> {
  await (await col()).deleteOne({ _id: fy });
  forgetRulebook();
  await recordPlatformAudit({ actorId: actor.id, action: "tax.rulebook.reset", target: { type: "tax_rulebook", id: fy }, details: {} });
  return { ok: true };
}

export async function rulebookHistory(fy: string): Promise<{ at: string; by: string; action: string }[]> {
  const d = await (await col()).findOne({ _id: fy });
  return (d?.history ?? []).slice(-30).reverse().map((h) => ({ at: h.at.toISOString(), by: h.by, action: h.action }));
}
