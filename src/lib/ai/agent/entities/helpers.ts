import "server-only";
import type { Json } from "@/lib/ai/agent/types";

export const fail = (error: string | undefined, extra: Json = {}): Json => ({ error: error || "That did not work.", ...extra });
export const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Turns a product validator's `{valid:false, errors}` into what the model sees (so it can ask the person for the right thing). */
export function invalid(errors: Record<string, string>): Json {
  return fail("Some values are missing or invalid.", { problems: Object.entries(errors).map(([k, m]) => `${k}: ${m}`) });
}

/** Runs a `validateX(input)` function from a product and returns either its data or a model-facing error. */
export function check<T>(v: { valid: true; data: T } | { valid: false; errors: Record<string, string> }): { ok: true; data: T } | { ok: false; error: Json } {
  return v.valid ? { ok: true, data: v.data } : { ok: false, error: invalid(v.errors) };
}

/** `a` and `b` as the plain input a form would send: nulls become empty so validators treat them as "not given". */
export function formInput(current: Json, changes: Json): Json {
  const merged: Json = { ...current, ...changes };
  for (const k of Object.keys(merged)) if (merged[k] === null) merged[k] = "";
  return merged;
}

// ── Standard create / update / delete wiring for products built the same way ──────────────────────────────────────────────────────────────

import type { AgentUser, EntityDef } from "@/lib/ai/agent/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
// The data a product validator returns differs per entity; the wiring below only passes it from the validator to the product's own function.
type Validated = { valid: true; data: any } | { valid: false; errors: Record<string, string> };

export interface CrudConfig<R extends { _id: unknown }> {
  /** Name used in the product's audit log, e.g. "program". */
  entity: string;
  validate: (input: any) => Validated;
  create?: (data: any, user: AgentUser, input: Json) => Promise<R>;
  update?: (id: string, data: any, user: AgentUser) => Promise<R | null | undefined>;
  remove?: (id: string, user: AgentUser) => Promise<{ ok: boolean; reason?: string } | boolean>;
  get: (id: string) => Promise<R | null>;
  /** The stored record as the plain input a form would have sent (so an update only needs the changed fields). */
  toInput?: (record: R) => Json;
  /** A readable name for audit lines and messages. */
  label: (record: Json) => string;
  audit: (user: AgentUser, entry: { action: string; entity: string; entityId: string; entityLabel?: string | null; summary?: string | null }) => Promise<void>;
  /** Extra rules the product's screen enforces before saving (referenced rows exist, etc.). Return an error to stop. */
  pre?: (data: any, user: AgentUser, mode: "create" | "update", id?: string) => Promise<Json | null>;
  /** What the product does after saving (notify students, sync a channel…). */
  post?: (record: R, user: AgentUser, mode: "create" | "update", before?: R) => Promise<void>;
}

export function crudOps<R extends { _id: unknown }>(cfg: CrudConfig<R>): NonNullable<EntityDef["ops"]> {
  const ops: NonNullable<EntityDef["ops"]> = {};
  if (cfg.create) {
    ops.create = async (values, u) => {
      const c = check(cfg.validate(values));
      if (!c.ok) return c.error;
      const stop = await cfg.pre?.(c.data, u, "create");
      if (stop) return stop;
      const rec = await cfg.create!(c.data, u, values);
      await cfg.audit(u, { action: "create", entity: cfg.entity, entityId: String(rec._id), entityLabel: cfg.label(rec as unknown as Json) });
      await cfg.post?.(rec, u, "create");
      return { ok: true, id: String(rec._id), record: rec as unknown as Json };
    };
  }
  if (cfg.update) {
    ops.update = async (id, values, u) => {
      const before = await cfg.get(id);
      if (!before) return fail(`${cfg.entity[0].toUpperCase()}${cfg.entity.slice(1)} not found.`);
      const current = cfg.toInput ? cfg.toInput(before) : (before as unknown as Json);
      const c = check(cfg.validate(formInput(current, values)));
      if (!c.ok) return c.error;
      const stop = await cfg.pre?.(c.data, u, "update", id);
      if (stop) return stop;
      const rec = await cfg.update!(id, c.data, u);
      if (!rec) return fail(`${cfg.entity[0].toUpperCase()}${cfg.entity.slice(1)} not found.`);
      await cfg.audit(u, { action: "update", entity: cfg.entity, entityId: id, entityLabel: cfg.label(rec as unknown as Json) });
      await cfg.post?.(rec, u, "update", before);
      return { ok: true, id, record: rec as unknown as Json };
    };
  }
  if (cfg.remove) {
    ops.remove = async (id, u) => {
      const before = await cfg.get(id);
      const r = await cfg.remove!(id, u);
      const ok = typeof r === "boolean" ? r : r.ok;
      if (!ok) return fail(typeof r === "boolean" ? `Could not delete the ${cfg.entity}.` : r.reason ?? `Could not delete the ${cfg.entity}.`);
      await cfg.audit(u, { action: "delete", entity: cfg.entity, entityId: id, entityLabel: before ? cfg.label(before as unknown as Json) : null });
      return { ok: true, id };
    };
  }
  return ops;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Field list helpers. */
import type { FieldDef } from "@/lib/ai/agent/types";
export const f = {
  str: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "string", required }),
  text: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "text", required }),
  num: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "number", required }),
  bool: (key: string, label: string): FieldDef => ({ key, label, type: "boolean" }),
  date: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "dateString", required }),
  email: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "email", required }),
  list: (key: string, label: string): FieldDef => ({ key, label, type: "stringList" }),
  json: (key: string, label: string, required = false): FieldDef => ({ key, label, type: "json", required }),
  enum: (key: string, label: string, options: readonly string[], required = false): FieldDef => ({ key, label, type: "enum", options: [...options], required }),
  ref: (key: string, label: string, ref: string, required = false, createOnly = false): FieldDef => ({ key, label, type: "ref", ref, required, ...(createOnly ? { createOnly: true } : {}) }),
};
export const values = (arr: readonly { value: string }[]): string[] => arr.map((x) => x.value);

// ── Calling a product's own server actions ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Runs one of a product's own server-action functions as the signed-in person (they check the session cookie and the product's permissions
 * themselves, exactly as when the screen calls them) and turns their result into what the model sees. Redirects they trigger count as success.
 */
export async function viaAction(call: () => Promise<unknown>, success = "Done."): Promise<Json> {
  try {
    const out = (await call()) as Json | undefined | void;
    if (out && typeof out === "object") {
      const o = out as Json;
      if (o.ok === false || (typeof o.error === "string" && o.error)) return fail(typeof o.error === "string" ? o.error : "That did not work.", o.fieldErrors ? { fieldErrors: o.fieldErrors as Json } : {});
      const { ok: _ok, ...rest } = o;
      void _ok;
      return { ok: true, result: success, ...rest };
    }
    return { ok: true, result: success };
  } catch (e) {
    const digest = (e as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return { ok: true, result: success };
    return fail(e instanceof Error ? e.message : "That did not work.");
  }
}
