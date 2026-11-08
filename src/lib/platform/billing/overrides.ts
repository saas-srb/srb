import { PLAN_FLAGS, PLAN_LIMIT_DEFS, USAGE_SERVICES, formatLimitValue, type CompanyOverrides, type LimitOverride, type PlanLimits, type SwitchOverride } from "@/lib/platform/billing/types";
import { MODULES } from "@/lib/platform/onboarding/catalog";

/**
 * Per-company adjustments to a plan, made by the platform admin in the Platform Console. Pure (no data access), so the enforcement code,
 * the Console and the tests all use the same rules.
 *
 *   limits   — any limit (users, storage, AI tokens, emails, voice minutes, domains, or a custom one): set it, add to it, or remove it
 *   flags    — a capability (custom domain, white-label, API access, priority support) forced on or off
 *   modules  — a product unlocked or locked
 *
 * Each can carry an end date (`until`): after it the plan applies again, with nothing to clean up.
 */

const live = (until: Date | null | undefined, now: Date) => !until || new Date(until).getTime() > now.getTime();

/** The plan's limits with the company's overrides applied. `null` stays "unlimited". */
export function applyLimitOverrides(base: PlanLimits, o: CompanyOverrides | null | undefined, now: Date = new Date()): PlanLimits {
  const out: PlanLimits = { ...base };
  for (const [key, ov] of Object.entries(o?.limits ?? {})) {
    if (!ov || !live(ov.until, now)) continue;
    if (ov.mode === "unlimited") out[key] = null;
    else if (ov.mode === "set" && Number.isFinite(ov.value)) out[key] = Math.max(0, Math.floor(ov.value!));
    else if (ov.mode === "add" && Number.isFinite(ov.value) && out[key] !== null && out[key] !== undefined) out[key] = Math.max(0, (out[key] as number) + Math.floor(ov.value!));
    else if (ov.mode === "add" && Number.isFinite(ov.value) && out[key] === undefined) out[key] = Math.max(0, Math.floor(ov.value!));
  }
  return out;
}

/** The plan's capabilities with the company's overrides applied. `null` (a deleted plan: nothing restricted) stays `null`. */
export function applyFlagOverrides(planFlags: readonly string[] | null, o: CompanyOverrides | null | undefined, now: Date = new Date()): string[] | null {
  if (planFlags === null) return null;
  const set = new Set(planFlags);
  for (const [key, ov] of Object.entries(o?.flags ?? {})) {
    if (!ov || !live(ov.until, now)) continue;
    if (ov.on) set.add(key);
    else set.delete(key);
  }
  return [...set];
}

/**
 * The products a company may use. `modules` is the plan's set (`null` = every product). Core products can never be locked. When every
 * product is allowed and some are locked, the result is "every product except those".
 */
export function applyModuleOverrides(modules: ReadonlySet<string> | null, o: CompanyOverrides | null | undefined, now: Date, allKeys: readonly string[], core: readonly string[]): Set<string> | null {
  const active = Object.entries(o?.modules ?? {}).filter(([, ov]) => ov && live(ov.until, now)) as [string, SwitchOverride][];
  if (active.length === 0) return modules === null ? null : new Set(modules);
  const set = new Set<string>(modules === null ? allKeys : modules);
  for (const [key, ov] of active) {
    if (ov.on) set.add(key);
    else if (!core.includes(key)) set.delete(key);
  }
  // Nothing left locked: back to "everything".
  return modules === null && allKeys.every((k) => set.has(k)) ? null : set;
}

/** Whether the company has any override that is still in force. */
export function hasActiveOverrides(o: CompanyOverrides | null | undefined, now: Date = new Date()): boolean {
  if (!o) return false;
  return [...Object.values(o.limits ?? {}), ...Object.values(o.flags ?? {}), ...Object.values(o.modules ?? {})].some((v) => v && live((v as { until?: Date | null }).until, now));
}

export interface OverridesInput {
  limits?: Record<string, { mode: string; value?: number | string | null; until?: string | null } | null | undefined>;
  flags?: Record<string, { on?: boolean; until?: string | null } | null | undefined>;
  modules?: Record<string, { on?: boolean; until?: string | null } | null | undefined>;
  note?: string;
}

export type OverridesCheck = { ok: true; value: CompanyOverrides } | { ok: false; error: string };

function parseUntil(raw: string | null | undefined): Date | null | "bad" {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return "bad";
  const d = new Date(raw.length === 10 ? `${raw}T23:59:59.999Z` : raw);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

/** Cleans what the Console sent. Only known limits, capabilities and products are accepted; entries with no change are dropped. */
export function checkOverridesInput(
  input: OverridesInput,
  known: { limitKeys: readonly string[]; flagKeys: readonly string[]; moduleKeys: readonly string[]; coreModules: readonly string[] },
  now: Date = new Date(),
): OverridesCheck {
  const out: CompanyOverrides = {};
  for (const [key, raw] of Object.entries(input.limits ?? {})) {
    if (!raw || raw.mode === "plan" || !raw.mode) continue;
    if (!known.limitKeys.includes(key)) return { ok: false, error: `Unknown limit: ${key}.` };
    const until = parseUntil(raw.until);
    if (until === "bad") return { ok: false, error: `The end date for ${key} isn't valid.` };
    if (until && until.getTime() <= now.getTime()) return { ok: false, error: `The end date for ${key} is in the past.` };
    if (raw.mode === "unlimited") {
      (out.limits ??= {})[key] = { mode: "unlimited", ...(until ? { until } : {}) };
      continue;
    }
    if (raw.mode !== "set" && raw.mode !== "add") return { ok: false, error: `Unknown change for ${key}.` };
    const n = typeof raw.value === "string" ? Number(raw.value.replace(/,/g, "").trim()) : raw.value;
    if (n === null || n === undefined || typeof n !== "number" || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return { ok: false, error: `Enter a whole number, 0 or more, for ${key}.` };
    if (n > 1_000_000_000_000) return { ok: false, error: `That number is too large for ${key}.` };
    if (raw.mode === "add" && n === 0) continue;
    (out.limits ??= {})[key] = { mode: raw.mode, value: n, ...(until ? { until } : {}) } as LimitOverride;
  }
  for (const [kind, src, keys] of [["flags", input.flags, known.flagKeys], ["modules", input.modules, known.moduleKeys]] as const) {
    for (const [key, raw] of Object.entries(src ?? {})) {
      if (!raw || typeof raw.on !== "boolean") continue;
      if (!keys.includes(key)) return { ok: false, error: `Unknown ${kind === "flags" ? "capability" : "product"}: ${key}.` };
      if (kind === "modules" && !raw.on && known.coreModules.includes(key)) return { ok: false, error: `${key} is a core product and can't be locked.` };
      const until = parseUntil(raw.until);
      if (until === "bad") return { ok: false, error: `The end date for ${key} isn't valid.` };
      if (until && until.getTime() <= now.getTime()) return { ok: false, error: `The end date for ${key} is in the past.` };
      (out[kind] ??= {})[key] = { on: raw.on, ...(until ? { until } : {}) };
    }
  }
  const note = (input.note ?? "").trim().slice(0, 500);
  if (note) out.note = note;
  return { ok: true, value: out };
}

/**
 * What the company itself is told about the adjustments made for it, in plain words (one line each). Only what is in force right now.
 * `planLimits` is what its plan gives, `effective` what it has now.
 */
export function describeOverrides(o: CompanyOverrides | null | undefined, planLimits: PlanLimits | null | undefined, effective: PlanLimits, now: Date = new Date()): string[] {
  if (!o) return [];
  const until = (d: Date | null | undefined) => (d ? ` until ${new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "");
  const lines: string[] = [];
  for (const [key, ov] of Object.entries(o.limits ?? {})) {
    if (!ov || !live(ov.until, now)) continue;
    const label = USAGE_SERVICES.find((u) => u.limitKey === key)?.label ?? PLAN_LIMIT_DEFS.find((d) => d.key === key)?.label ?? key;
    const was = planLimits ? formatLimitValue(key, planLimits[key] ?? null) : "";
    lines.push(`${label}: ${formatLimitValue(key, effective[key] ?? null)}${was ? ` (your plan: ${was})` : ""}${until(ov.until)}`);
  }
  for (const [key, ov] of Object.entries(o.flags ?? {})) {
    if (!ov || !live(ov.until, now)) continue;
    lines.push(`${PLAN_FLAGS.find((f) => f.key === key)?.label ?? key}: ${ov.on ? "on" : "off"}${until(ov.until)}`);
  }
  for (const [key, ov] of Object.entries(o.modules ?? {})) {
    if (!ov || !live(ov.until, now)) continue;
    lines.push(`${MODULES.find((m) => m.key === key)?.label ?? key}: ${ov.on ? "unlocked" : "locked"}${until(ov.until)}`);
  }
  return lines;
}
