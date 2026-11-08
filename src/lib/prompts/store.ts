import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { PROMPT_BY_KEY, PROMPTS } from "@/lib/prompts/registry";
import { renderPrompt, validatePromptText, withPinned } from "@/lib/prompts/types";
import { companyPromptText } from "@/lib/prompts/company-store";
import { withSecurity } from "@/lib/prompts/guard";

/**
 * The platform's edits to prompts (`prompt_overrides`, one document per prompt that has been changed), their history (`prompt_versions`,
 * every save, restore and reset) and how often each prompt is used (`prompt_stats`, per day). The registry's text is always the fallback,
 * so a prompt keeps working when nothing is saved, when an override is switched off, and when the database can't be read.
 */

interface Override {
  _id: string;
  enabled: boolean;
  text: string;
  version: number;
  note: string;
  updatedAt: Date;
  updatedBy: string;
}
export interface PromptVersion {
  _id: string;
  key: string;
  version: number;
  action: "save" | "restore" | "reset" | "enable" | "disable";
  /** Whether the custom text was switched on at that moment. */
  enabled?: boolean;
  text: string;
  note: string;
  at: Date;
  by: string;
}

const CACHE_MS = 10_000;
const g = globalThis as unknown as { __promptOverrides?: { at: number; rows: Map<string, Override> }; __promptUses?: Map<string, { custom: number; total: number }>; __promptFlushAt?: number };

async function overridesCol() {
  return (await getPlatformDb()).collection<Override>("prompt_overrides");
}
async function versionsCol() {
  return (await getPlatformDb()).collection<PromptVersion>("prompt_versions");
}
let indexed = false;
async function statsCol() {
  const col = (await getPlatformDb()).collection<{ _id: string; key: string; day: string; uses: number; custom: number }>("prompt_stats");
  if (!indexed) {
    indexed = true;
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
      indexed = false;
    });
  }
  return col;
}
export const forgetPrompts = () => {
  g.__promptOverrides = undefined;
};

async function overrides(): Promise<Map<string, Override>> {
  if (g.__promptOverrides && Date.now() - g.__promptOverrides.at < CACHE_MS) return g.__promptOverrides.rows;
  const rows = new Map((await (await overridesCol()).find({}).toArray()).map((o) => [o._id, o]));
  g.__promptOverrides = { at: Date.now(), rows };
  return rows;
}

// ── Use counters: counted in memory, written at most every 30 seconds ──────────────────────────────────────────────────────────────

function count(key: string, custom: boolean) {
  const uses = (g.__promptUses ??= new Map());
  const u = uses.get(key) ?? { custom: 0, total: 0 };
  u.total++;
  if (custom) u.custom++;
  uses.set(key, u);
  if (Date.now() - (g.__promptFlushAt ?? 0) > 30_000) {
    g.__promptFlushAt = Date.now();
    void flushCounts();
  }
}
export async function flushCounts(): Promise<void> {
  const uses = g.__promptUses;
  if (!uses || uses.size === 0) return;
  g.__promptUses = new Map();
  const day = new Date().toISOString().slice(0, 10);
  try {
    const col = await statsCol();
    await Promise.all([...uses].map(([key, u]) => col.updateOne({ _id: `${key}:${day}` }, { $inc: { uses: u.total, custom: u.custom }, $setOnInsert: { key, day, expiresAt: new Date(Date.now() + 100 * 86_400_000) } as never }, { upsert: true })));
  } catch {
    /* counters are a convenience */
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const same = (a: string, b: string) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();

/** The text in force for `key` and whether it is a platform override. A read problem falls back to the registry's text. */
export async function promptText(key: string): Promise<{ text: string; custom: boolean }> {
  const def = PROMPT_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown prompt "${key}"`);
  try {
    const o = (await overrides()).get(key);
    if (o?.enabled && !same(o.text, def.text) && !validatePromptText(def, o.text)) return { text: o.text, custom: true };
  } catch (err) {
    console.error(`[prompts] could not read overrides; using the default for ${key}`, err instanceof Error ? err.message : err);
  }
  return { text: def.text, custom: false };
}

/**
 * A prompt, filled in. This is what the rest of the code calls. The text comes from, in order: the current company's own wording (only for
 * prompts that allow it, and always inside the fixed security header and footer), the platform's override, the built-in text.
 */
export async function getPrompt(key: string, vars: Record<string, string | number | null | undefined> = {}): Promise<string> {
  const def = PROMPT_BY_KEY.get(key)!;
  const declared = def.vars.map((v) => v.name);
  const own = await companyPromptText(def);
  if (own !== null) {
    count(key, true);
    return withSecurity(renderPrompt(withPinned(def, own), vars, declared));
  }
  const { text, custom } = await promptText(key);
  count(key, custom);
  return renderPrompt(withPinned(def, text), vars, declared);
}

// ── Changing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// History is append-only: every change, including a reset and a restore, is a new numbered version and nothing is ever deleted, so any
// version can be brought back at any time. The override document is kept after a reset (it then simply holds the built-in text) so the
// numbering never starts over.

type Actor = { id: string; email: string };
export type PromptResult = { ok: true; version: number } | { ok: false; error: string };

/** Takes the next version number and applies `set` in one step, then records the version. */
async function commit(key: string, action: PromptVersion["action"], enabled: boolean, text: string, noteText: string, actor: Actor): Promise<PromptResult> {
  const col = await overridesCol();
  const row = await col.findOneAndUpdate(
    { _id: key },
    { $inc: { version: 1 }, $set: { enabled, text, note: noteText.slice(0, 300), updatedAt: new Date(), updatedBy: actor.email } },
    { upsert: true, returnDocument: "after" },
  );
  const version = row?.version ?? 1;
  forgetPrompts();
  await (await versionsCol()).insertOne({ _id: randomUUID(), key, version, action, enabled, text, note: noteText.slice(0, 300), at: new Date(), by: actor.email });
  await recordPlatformAudit({ actorId: actor.id, action: `prompt.${action}`, target: { type: "prompt", id: key }, details: { version, note: noteText.slice(0, 120) } });
  return { ok: true, version };
}

/** Makes `text` the prompt's text (the built-in text switches the custom version off). */
async function apply(key: string, text: string, action: "save" | "restore", noteText: string, actor: Actor): Promise<PromptResult> {
  const def = PROMPT_BY_KEY.get(key);
  if (!def) return { ok: false, error: "Unknown prompt." };
  const clean = text.replace(/\r\n/g, "\n").trim();
  const current = await (await overridesCol()).findOne({ _id: key });
  if (same(clean, def.text)) {
    if (!current || (same(current.text, def.text) && !current.enabled)) return { ok: true, version: current?.version ?? 0 };
    return commit(key, "reset", false, def.text, noteText || "Back to the built-in text", actor);
  }
  const problem = validatePromptText(def, clean);
  if (problem) return { ok: false, error: problem };
  if (current && current.enabled && same(current.text, clean)) return { ok: true, version: current.version };
  return commit(key, action, true, clean, noteText, actor);
}

/** Saves a new version of the prompt and switches it on. */
export const savePrompt = (key: string, text: string, noteText: string, actor: Actor): Promise<PromptResult> => apply(key, text, "save", noteText, actor);

export async function setPromptEnabled(key: string, enabled: boolean, actor: Actor): Promise<PromptResult> {
  const def = PROMPT_BY_KEY.get(key);
  const current = await (await overridesCol()).findOne({ _id: key });
  if (!def || !current || same(current.text, def.text)) return { ok: false, error: "This prompt has no custom version to switch." };
  if (current.enabled === !!enabled) return { ok: true, version: current.version };
  const bad = enabled ? validatePromptText(def, current.text) : null;
  if (bad) return { ok: false, error: bad };
  return commit(key, enabled ? "enable" : "disable", !!enabled, current.text, "", actor);
}

/** Back to the built-in text, as a new version. Earlier versions stay in the history and can be restored. */
export async function resetPrompt(key: string, actor: Actor): Promise<PromptResult> {
  const def = PROMPT_BY_KEY.get(key);
  if (!def) return { ok: false, error: "Unknown prompt." };
  return apply(key, def.text, "save", "Back to the built-in text", actor);
}

/** Brings any earlier version back as a new version (nothing is removed). */
export async function restorePromptVersion(key: string, versionId: string, actor: Actor): Promise<PromptResult> {
  const v = await (await versionsCol()).findOne({ _id: versionId, key });
  if (!v) return { ok: false, error: "That version doesn't exist." };
  return apply(key, v.text, "restore", `Restored version ${v.version}`, actor);
}

export async function promptHistory(key: string, limit = 500): Promise<PromptVersion[]> {
  if (!PROMPT_BY_KEY.has(key)) return [];
  return (await versionsCol()).find({ key }).sort({ version: -1 }).limit(limit).toArray();
}

export interface PromptStatus {
  key: string;
  /** default: the built-in text is in force; custom: a platform version is; off: one exists but is switched off. */
  state: "default" | "custom" | "off";
  custom: boolean;
  enabled: boolean;
  /** The latest version number (0 when the prompt has never been changed). */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string;
  uses7d: number;
  customUses7d: number;
  /** The platform's text, when it differs from the built-in one (the editor starts from it). */
  overrideText: string | null;
}

export async function listPromptStatus(): Promise<Record<string, PromptStatus>> {
  await flushCounts();
  const [rows, stats] = await Promise.all([
    overridesCol().then((c) => c.find({}).toArray()),
    statsCol().then((c) => c.aggregate<{ _id: string; uses: number; custom: number }>([{ $match: { day: { $gte: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) } } }, { $group: { _id: "$key", uses: { $sum: "$uses" }, custom: { $sum: "$custom" } } }]).toArray()),
  ]);
  const byKey = new Map(rows.map((o) => [o._id, o]));
  const used = new Map(stats.map((s) => [s._id, s]));
  return Object.fromEntries(
    PROMPTS.map((p) => {
      const o = byKey.get(p.key);
      const differs = !!o && !same(o.text, p.text);
      const state = !differs ? "default" : o!.enabled ? "custom" : "off";
      return [p.key, { key: p.key, state, custom: state === "custom", enabled: state === "custom", version: o?.version ?? 0, updatedAt: o?.updatedAt.toISOString() ?? null, updatedBy: o?.updatedBy ?? null, note: o?.note ?? "", uses7d: used.get(p.key)?.uses ?? 0, customUses7d: used.get(p.key)?.custom ?? 0, overrideText: differs ? o!.text : null } satisfies PromptStatus];
    }),
  );
}
