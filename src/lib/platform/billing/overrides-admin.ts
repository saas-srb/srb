import "server-only";
import { getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription, updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { checkOverridesInput, hasActiveOverrides, type OverridesInput } from "@/lib/platform/billing/overrides";
import { PLAN_FLAGS, PLAN_LIMIT_DEFS, USAGE_SERVICES, type CompanyOverrides, type PlanLimits } from "@/lib/platform/billing/types";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { getUsageSummary } from "@/lib/platform/billing/usage-summary";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { recordPlatformAudit } from "@/lib/platform/audit";

/**
 * What the platform admin can change for ONE company on top of its plan: every limit (users, storage, AI tokens, emails, voice minutes,
 * domains, and any custom limit), every capability and every product. Stored on the subscription (`overrides`), applied in one place
 * (`entitlementsFor`), so every limit check and every product gate in the app follows it at once. Each change is audited with who and why.
 */

export interface LimitRow {
  key: string;
  label: string;
  unit: string;
  /** What the plan gives (`null` = unlimited). */
  plan: number | null;
  /** What the company has right now, after add-ons and overrides. */
  effective: number | null;
  /** Used so far (this month for monthly limits). */
  used: number | null;
  override: { mode: "set" | "add" | "unlimited"; value: number | null; until: string | null } | null;
  custom: boolean;
}
export interface SwitchRow {
  key: string;
  label: string;
  /** Whether the plan includes it. */
  plan: boolean;
  /** Whether the company has it now. */
  effective: boolean;
  core?: boolean;
  override: { on: boolean; until: string | null } | null;
}
export interface OverridesDetail {
  companyId: string;
  planName: string | null;
  /** Complimentary / internal accounts have no limits at all: nothing to change. */
  unlimitedAnyway: boolean;
  active: boolean;
  limits: LimitRow[];
  flags: SwitchRow[];
  modules: SwitchRow[];
  note: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

function limitKeysFor(planLimits: PlanLimits | undefined, o: CompanyOverrides | null | undefined): string[] {
  return [...new Set([...PLAN_LIMIT_DEFS.map((d) => d.key as string), ...Object.keys(planLimits ?? {}), ...Object.keys(o?.limits ?? {})])];
}

export async function getOverridesDetail(companyId: string): Promise<OverridesDetail | null> {
  const sub = await getCompanySubscription(companyId);
  if (!sub) return null;
  const plan = await getPlan(sub.planId);
  const ents = await entitlementsFor(companyId);
  const o = sub.overrides ?? null;
  const unlimitedAnyway = sub.status === "internal";
  const used = unlimitedAnyway ? [] : await runAsCompany(companyId, () => getUsageSummary()).catch(() => []);
  const usedBy = new Map(used.map((u) => [u.limitKey, u.used]));
  const defs = new Map<string, { label: string; unit: string }>([...PLAN_LIMIT_DEFS.map((d) => [d.key as string, { label: d.label as string, unit: d.unit as string }] as const), ...USAGE_SERVICES.map((u) => [u.limitKey, { label: u.label, unit: u.unit }] as const)]);

  const limits: LimitRow[] = limitKeysFor(plan?.limits, o).map((key) => {
    const def = defs.get(key);
    const ov = o?.limits?.[key];
    return {
      key,
      label: def?.label ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      unit: def?.unit ?? "",
      plan: plan ? plan.limits[key] ?? null : null,
      effective: ents.limits[key] ?? null,
      used: usedBy.has(key) ? usedBy.get(key)! : null,
      override: ov ? { mode: ov.mode, value: ov.value ?? null, until: iso(ov.until) } : null,
      custom: !PLAN_LIMIT_DEFS.some((d) => d.key === key),
    };
  });
  const planFlags = new Set(plan?.flags ?? []);
  const flags: SwitchRow[] = PLAN_FLAGS.map((f) => ({ key: f.key, label: f.label, plan: planFlags.has(f.key), effective: ents.flags === null || ents.flags.includes(f.key), override: o?.flags?.[f.key] ? { on: o.flags[f.key].on, until: iso(o.flags[f.key].until) } : null }));
  const planIncludes = (key: string) => !plan || plan.modules === "all" || MODULES.some((m) => m.key === key && m.core) || plan.modules.includes(key as never);
  const modules: SwitchRow[] = MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    plan: planIncludes(m.key),
    effective: ents.modules === null || ents.modules.has(m.key),
    core: m.core,
    override: o?.modules?.[m.key] ? { on: o.modules[m.key].on, until: iso(o.modules[m.key].until) } : null,
  }));
  return { companyId, planName: plan?.name ?? null, unlimitedAnyway, active: hasActiveOverrides(o), limits, flags, modules, note: o?.note ?? "", updatedAt: iso(o?.updatedAt), updatedBy: o?.updatedBy ?? null };
}

export type OverridesResult = { ok: true; message: string } | { ok: false; error: string };

/** Replaces the company's overrides with what the Console sent (an empty set clears them). */
export async function saveCompanyOverrides(companyId: string, input: OverridesInput, actorId: string): Promise<OverridesResult> {
  const company = await (await getPlatformDb()).collection<{ _id: string; isPlatformOwner?: boolean; name?: string }>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { isPlatformOwner: 1, name: 1 } });
  if (!company) return { ok: false, error: "Unknown company." };
  if (company.isPlatformOwner) return { ok: false, error: "The platform's own company has no limits." };
  const sub = await getCompanySubscription(companyId);
  if (!sub) return { ok: false, error: "This company has no subscription yet." };
  const plan = await getPlan(sub.planId);
  const before = sub.overrides ?? null;
  const checked = checkOverridesInput(input, {
    limitKeys: limitKeysFor(plan?.limits, before),
    flagKeys: PLAN_FLAGS.map((f) => f.key),
    moduleKeys: MODULES.map((m) => m.key),
    coreModules: MODULES.filter((m) => m.core).map((m) => m.key),
  });
  if (!checked.ok) return checked;
  const now = new Date();
  const next = checked.value;
  const empty = !next.limits && !next.flags && !next.modules;
  await updateCompanySubscription(companyId, { overrides: empty ? null : { ...next, updatedAt: now, updatedBy: actorId } });

  const changed = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null));
  const diff = { limits: changed(before?.limits, next.limits), flags: changed(before?.flags, next.flags), modules: changed(before?.modules, next.modules) };
  await recordPlatformAudit({
    actorId,
    action: empty ? "company.overrides.clear" : "company.overrides.update",
    target: { type: "company", id: companyId },
    companyId,
    details: { company: company.name ?? null, ...diff, limitsNow: Object.fromEntries(Object.entries(next.limits ?? {}).map(([k, v]) => [k, v.mode === "unlimited" ? "unlimited" : `${v.mode} ${v.value}${v.until ? ` until ${new Date(v.until).toISOString().slice(0, 10)}` : ""}`])), note: next.note ?? null },
  });
  return { ok: true, message: empty ? "Back to the plan's limits." : "Saved. It applies to this company within a few seconds." };
}
