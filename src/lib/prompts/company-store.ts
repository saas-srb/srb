import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { companyMayEditPrompt, getFeatureControls } from "@/lib/platform/feature-controls";
import { PROMPT_BY_KEY } from "@/lib/prompts/registry";
import { checkCompanyPrompt } from "@/lib/prompts/guard";
import type { PromptDef } from "@/lib/prompts/types";

/**
 * A company's own wording of the prompts that allow it. Everything here goes through the company-scoped database layer
 * (`company_prompt_overrides`, `company_prompt_versions`: every row carries its companyId and every read and write is limited to the
 * current company), and every cache is keyed by company, so one company's wording can never reach another. What the model finally
 * receives is the company's wording inside the fixed security header and footer (see `guard.ts`), added by `getPrompt`.
 *
 * History is append-only like the platform's: every save, restore, reset and on/off switch is a new numbered version, none is ever
 * deleted, numbering never restarts and any version can be brought back.
 */

interface Override {
  _id: string;
  key: string;
  enabled: boolean;
  text: string;
  /** The standard text this wording was written from (used to tell the company's own lines from the standard ones). */
  base: string;
  version: number;
  note: string;
  updatedAt: Date;
  updatedBy: string;
}
export interface CompanyPromptVersion {
  _id: string;
  key: string;
  version: number;
  action: "save" | "restore" | "reset" | "enable" | "disable";
  enabled: boolean;
  text: string;
  note: string;
  at: Date;
  by: string;
}

const CACHE_MS = 10_000;
const g = globalThis as unknown as { __companyPrompts?: Map<string, { at: number; rows: Map<string, Override> }> };

const overridesCol = async () => (await getDb()).collection<Override>("company_prompt_overrides");
const versionsCol = async () => (await getDb()).collection<CompanyPromptVersion>("company_prompt_versions");
const same = (a: string, b: string) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();

const forget = (companyId: string | null) => {
  if (companyId) g.__companyPrompts?.delete(companyId);
};

async function rowsFor(companyId: string): Promise<Map<string, Override>> {
  const cache = (g.__companyPrompts ??= new Map());
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = new Map((await (await overridesCol()).find({}).toArray()).map((o) => [o._id, o]));
  cache.set(companyId, { at: Date.now(), rows });
  return rows;
}

/** The current company's own text for this prompt, or null (no company here, not allowed, none saved, switched off, or no longer valid). Never throws. */
export async function companyPromptText(def: PromptDef): Promise<string | null> {
  if (!def.companyEditable) return null;
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return null;
    if (!companyMayEditPrompt(await getFeatureControls(), def.key)) return null;
    const o = (await rowsFor(companyId)).get(def.key);
    if (o?.enabled && !same(o.text, o.base) && !checkCompanyPrompt(def, o.text, o.base)) return o.text;
  } catch (err) {
    console.error(`[prompts] could not read the company's wording for ${def.key}; using the standard text`, err instanceof Error ? err.message : err);
  }
  return null;
}

// ── Changing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Actor = { id: string; email: string };
export type CompanyPromptResult = { ok: true; version: number } | { ok: false; error: string };

async function guardEdit(key: string): Promise<{ def: PromptDef; companyId: string } | string> {
  const def = PROMPT_BY_KEY.get(key);
  if (!def || !def.companyEditable) return "This prompt is managed by SelfRun and can't be changed by a company.";
  if (!companyMayEditPrompt(await getFeatureControls(), key)) return "SelfRun has turned off changes to this prompt.";
  const companyId = await currentCompanyIdOrNull();
  if (!companyId) return "No workspace.";
  return { def, companyId };
}

async function commit(def: PromptDef, companyId: string, action: CompanyPromptVersion["action"], enabled: boolean, text: string, base: string, noteText: string, actor: Actor): Promise<CompanyPromptResult> {
  const row = await (await overridesCol()).findOneAndUpdate(
    { _id: def.key },
    { $inc: { version: 1 }, $set: { key: def.key, enabled, text, base, note: noteText.slice(0, 300), updatedAt: new Date(), updatedBy: actor.email } },
    { upsert: true, returnDocument: "after" },
  );
  const version = row?.version ?? 1;
  forget(companyId);
  await (await versionsCol()).insertOne({ _id: randomUUID(), key: def.key, version, action, enabled, text, note: noteText.slice(0, 300), at: new Date(), by: actor.email });
  await recordPlatformAudit({ actorId: actor.id, action: `prompt.company.${action}`, companyId, target: { type: "prompt", id: def.key }, details: { version, note: noteText.slice(0, 120) } });
  return { ok: true, version };
}

/**
 * Makes `text` this company's wording. `base` is the standard text now in force (the platform's, or the built-in one): wording identical to
 * it switches the company's version off instead of storing a copy.
 */
async function apply(key: string, text: string, base: string, action: "save" | "restore", noteText: string, actor: Actor): Promise<CompanyPromptResult> {
  const ctx = await guardEdit(key);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const { def, companyId } = ctx;
  const clean = text.replace(/\r\n/g, "\n").trim();
  const current = await (await overridesCol()).findOne({ _id: key });
  if (same(clean, base)) {
    if (!current || (same(current.text, current.base) && !current.enabled)) return { ok: true, version: current?.version ?? 0 };
    return commit(def, companyId, "reset", false, base, base, noteText || "Back to the standard text", actor);
  }
  const problem = checkCompanyPrompt(def, clean, base);
  if (problem) return { ok: false, error: problem };
  if (current && current.enabled && same(current.text, clean)) return { ok: true, version: current.version };
  return commit(def, companyId, action, true, clean, base, noteText, actor);
}

export const saveCompanyPrompt = (key: string, text: string, base: string, noteText: string, actor: Actor) => apply(key, text, base, "save", noteText, actor);
export const resetCompanyPrompt = (key: string, base: string, actor: Actor) => apply(key, base, base, "save", "Back to the standard text", actor);

export async function setCompanyPromptEnabled(key: string, enabled: boolean, actor: Actor): Promise<CompanyPromptResult> {
  const ctx = await guardEdit(key);
  if (typeof ctx === "string") return { ok: false, error: ctx };
  const { def, companyId } = ctx;
  const current = await (await overridesCol()).findOne({ _id: key });
  if (!current || same(current.text, current.base)) return { ok: false, error: "This prompt has no version of your own to switch." };
  if (current.enabled === !!enabled) return { ok: true, version: current.version };
  const bad = enabled ? checkCompanyPrompt(def, current.text, current.base) : null;
  if (bad) return { ok: false, error: bad };
  return commit(def, companyId, enabled ? "enable" : "disable", !!enabled, current.text, current.base, "", actor);
}

/** Brings any earlier version back as a new version (nothing is removed). `base` is the standard text now in force. */
export async function restoreCompanyPromptVersion(key: string, versionId: string, base: string, actor: Actor): Promise<CompanyPromptResult> {
  const v = await (await versionsCol()).findOne({ _id: versionId, key });
  if (!v) return { ok: false, error: "That version doesn't exist." };
  return apply(key, v.text, base, "restore", `Restored version ${v.version}`, actor);
}

export async function companyPromptHistory(key: string, limit = 500): Promise<CompanyPromptVersion[]> {
  if (!PROMPT_BY_KEY.get(key)?.companyEditable) return [];
  return (await versionsCol()).find({ key }).sort({ version: -1 }).limit(limit).toArray();
}

export interface CompanyPromptStatus {
  key: string;
  state: "default" | "custom" | "off";
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string;
  /** The company's text when it differs from the standard one. */
  overrideText: string | null;
  /** Saved text that no longer passes the checks, so the standard text is being used. */
  invalid: boolean;
}

/** This company's state for every prompt it may change. */
export async function listCompanyPromptStatus(): Promise<Record<string, CompanyPromptStatus>> {
  const rows = new Map((await (await overridesCol()).find({}).toArray()).map((o) => [o._id, o]));
  return Object.fromEntries(
    [...PROMPT_BY_KEY.values()].filter((d) => d.companyEditable).map((d) => {
      const o = rows.get(d.key);
      const differs = !!o && !same(o.text, o.base);
      const state = !differs ? "default" : o!.enabled ? "custom" : "off";
      return [d.key, { key: d.key, state, version: o?.version ?? 0, updatedAt: o?.updatedAt.toISOString() ?? null, updatedBy: o?.updatedBy ?? null, note: o?.note ?? "", overrideText: differs ? o!.text : null, invalid: differs && o!.enabled && !!checkCompanyPrompt(d, o!.text, o!.base) } satisfies CompanyPromptStatus];
    }),
  );
}

/** For the platform: how many companies use their own wording of each prompt right now (across companies; read-only counts, no text). */
export async function companyPromptCounts(): Promise<Record<string, number>> {
  const { getPlatformDb } = await import("@/lib/platform/tenancy/platform-db");
  const rows = await (await getPlatformDb()).collection("company_prompt_overrides").aggregate<{ _id: string; n: number }>([{ $match: { enabled: true } }, { $group: { _id: "$key", n: { $sum: 1 } } }]).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}
