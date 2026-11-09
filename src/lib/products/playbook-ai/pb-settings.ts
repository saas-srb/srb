import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { playbookCan } from "@/lib/playbook-roles";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { ALL_META } from "@/lib/products/playbook-ai/catalogue/meta";
import { DEFAULT_NUMBER_PATTERN, DEFAULT_NUMBER_PREFIX, PREFIX_RE, SERIES_RE, validatePattern } from "@/lib/products/playbook-ai/numbering-pattern";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import type { PolicyContext, StatusPolicy } from "@/lib/products/playbook-ai/status";

/**
 * Document settings (`pb_settings`, one document per company with `_id: "main"`, a KEYED collection): numbering, approval rules, legal types,
 * category access and retention. Every rule has a company-wide default and an optional override per document type (`byType`), so a
 * company can number offer letters differently from contracts, or require a different approver only for contracts.
 */

export interface NumberingRule {
  /** Pattern with tokens, see `numbering-pattern.ts`. */
  pattern: string;
  prefix: string;
  /** Counter series. Types that share a series share the running number. */
  series: string;
}
export interface ApprovalRule {
  /** The person who wrote (or submitted) the document may not approve it. */
  requireDifferentApprover: boolean;
  /** Owner default: an author's own document is approved as soon as it is submitted. Ignored when a different approver is required. */
  autoApproveOwn: boolean;
}
export interface PbSettings {
  numbering: { default: NumberingRule; byType: Record<string, Partial<NumberingRule>> };
  approval: { default: ApprovalRule; byType: Record<string, Partial<ApprovalRule>> };
  /** Extra document types that need the lawyer-review confirmation at issue, on top of the catalogue's legal types. */
  legalTypes: string[];
  /** Category (the part of the type id before the dot, e.g. "hr") to the roles that may open it. A category without a row is open to everyone with VIEW. */
  categoryRoles: Record<string, string[]>;
  /** Months a document of a type must be kept after it was issued, before it may be purged. No default period exists: nothing is retained unless the company sets it. */
  retentionMonths: { default: number | null; byType: Record<string, number | null> };
  /** AI drafting: switch, model and the limits that keep use (and cost) under control. Every number is the company's setting. */
  ai: AiSettings;
}
export interface AiSettings {
  enabled: boolean;
  /** The model to ask for; empty means the platform's default text model. */
  model: string | null;
  perUserPerMinute: number;
  perUserPerDay: number;
  perCompanyPerDay: number;
  maxOutputTokens: number;
}

export const DEFAULT_SETTINGS: PbSettings = {
  numbering: { default: { pattern: DEFAULT_NUMBER_PATTERN, prefix: DEFAULT_NUMBER_PREFIX, series: "default" }, byType: {} },
  approval: { default: { requireDifferentApprover: false, autoApproveOwn: true }, byType: {} },
  legalTypes: [],
  categoryRoles: {},
  retentionMonths: { default: null, byType: {} },
  ai: { enabled: true, model: null, perUserPerMinute: 6, perUserPerDay: 100, perCompanyPerDay: 1000, maxOutputTokens: 4000 },
};

interface Stored extends Partial<PbSettings> { _id: "main"; updatedAt?: Date; updatedBy?: string | null }

async function col() {
  return (await getDb()).collection<Stored>(PB_COLLECTIONS.settings);
}

export async function getPbSettings(): Promise<PbSettings> {
  const row = await (await col()).findOne({ _id: "main" });
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  return {
    numbering: { default: { ...DEFAULT_SETTINGS.numbering.default, ...row.numbering?.default }, byType: row.numbering?.byType ?? {} },
    approval: { default: { ...DEFAULT_SETTINGS.approval.default, ...row.approval?.default }, byType: row.approval?.byType ?? {} },
    legalTypes: row.legalTypes ?? [],
    categoryRoles: row.categoryRoles ?? {},
    retentionMonths: { default: row.retentionMonths?.default ?? null, byType: row.retentionMonths?.byType ?? {} },
    ai: { ...DEFAULT_SETTINGS.ai, ...row.ai },
  };
}

const CATALOGUE_PREFIX = new Map(ALL_META.map((m) => [m.id, m.numberingPrefix]));
const CATALOGUE_LEGAL = new Map(ALL_META.map((m) => [m.id, m.legal.review]));
const categoryOf = (typeId: string | null) => (typeId ? typeId.split(".")[0] : null);

/** The numbering rule for a type: company type override, else the company default; the catalogue's suggested prefix applies only when the company set none for the type. */
export function numberingFor(s: PbSettings, typeId: string | null): NumberingRule {
  const o = typeId ? s.numbering.byType[typeId] : undefined;
  const base = s.numbering.default;
  const suggested = typeId && base.prefix === DEFAULT_NUMBER_PREFIX ? CATALOGUE_PREFIX.get(typeId) : undefined;
  return {
    pattern: o?.pattern ?? base.pattern,
    prefix: o?.prefix ?? suggested ?? base.prefix,
    series: o?.series ?? (o?.prefix || o?.pattern || suggested ? typeId ?? base.series : base.series),
  };
}
export function approvalFor(s: PbSettings, typeId: string | null): ApprovalRule {
  return { ...s.approval.default, ...(typeId ? s.approval.byType[typeId] : undefined) };
}
export function isLegalType(s: PbSettings, typeId: string | null): boolean {
  return !!typeId && (CATALOGUE_LEGAL.get(typeId) === true || s.legalTypes.includes(typeId));
}
export function retentionMonthsFor(s: PbSettings, typeId: string | null): number | null {
  if (typeId && typeId in s.retentionMonths.byType) return s.retentionMonths.byType[typeId];
  return s.retentionMonths.default;
}
/** Roles a category is restricted to, or null when it is open. */
export function restrictedRoles(s: PbSettings, typeId: string | null): string[] | null {
  const c = categoryOf(typeId);
  return c && s.categoryRoles[c] && s.categoryRoles[c].length ? s.categoryRoles[c] : null;
}
/** Categories restricted for this person (they hold none of the allowed roles). Their own documents stay visible to them. */
export function deniedCategories(s: PbSettings, actor: Pick<PbActor, "roles">): string[] {
  if (actor.roles.includes("super_admin")) return [];
  return Object.entries(s.categoryRoles).filter(([, roles]) => roles.length > 0 && !roles.some((r) => actor.roles.includes(r))).map(([c]) => c);
}

// ---------------------------------------------------------------------------------------------------------------------------------

const ROLE_RE = /^[a-z][a-z0-9_]{0,39}$/;
const TYPE_RE = /^[a-z]{1,4}\.[a-z0-9_]{1,60}$/;

function cleanRule(r: unknown, errors: string[], where: string): Partial<NumberingRule> {
  const o = (r ?? {}) as Record<string, unknown>;
  const out: Partial<NumberingRule> = {};
  if (o.pattern !== undefined) { const v = validatePattern(o.pattern); if (v.ok) out.pattern = v.value; else errors.push(`${where}: ${v.error}`); }
  if (o.prefix !== undefined) { if (typeof o.prefix === "string" && PREFIX_RE.test(o.prefix)) out.prefix = o.prefix; else errors.push(`${where}: the prefix is 1 to 16 capital letters, digits or hyphens.`); }
  if (o.series !== undefined) { if (typeof o.series === "string" && SERIES_RE.test(o.series)) out.series = o.series; else errors.push(`${where}: the series name is not valid.`); }
  return out;
}

export function validateSettings(input: unknown): { ok: true; value: PbSettings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  const num = (o.numbering ?? {}) as { default?: unknown; byType?: Record<string, unknown> };
  const app = (o.approval ?? {}) as { default?: Record<string, unknown>; byType?: Record<string, Record<string, unknown>> };
  const bool = (v: unknown, where: string): boolean | undefined => { if (v === undefined) return undefined; if (typeof v === "boolean") return v; errors.push(`${where} must be yes or no.`); return undefined; };

  const numDefault = { ...DEFAULT_SETTINGS.numbering.default, ...cleanRule(num.default, errors, "Default numbering") };
  const numByType: PbSettings["numbering"]["byType"] = {};
  for (const [t, r] of Object.entries(num.byType ?? {})) {
    if (!TYPE_RE.test(t)) { errors.push(`"${t}" is not a document type.`); continue; }
    numByType[t] = cleanRule(r, errors, `Numbering for ${t}`);
  }
  const rule = (r: Record<string, unknown> | undefined, where: string): Partial<ApprovalRule> => {
    const x: Partial<ApprovalRule> = {};
    const a = bool(r?.requireDifferentApprover, `${where}: different approver`); if (a !== undefined) x.requireDifferentApprover = a;
    const b = bool(r?.autoApproveOwn, `${where}: approve own`); if (b !== undefined) x.autoApproveOwn = b;
    return x;
  };
  const appDefault = { ...DEFAULT_SETTINGS.approval.default, ...rule(app.default, "Default approval") };
  const appByType: PbSettings["approval"]["byType"] = {};
  for (const [t, r] of Object.entries(app.byType ?? {})) {
    if (!TYPE_RE.test(t)) { errors.push(`"${t}" is not a document type.`); continue; }
    appByType[t] = rule(r, `Approval for ${t}`);
  }
  const legalTypes = Array.isArray(o.legalTypes) ? o.legalTypes : [];
  if (!legalTypes.every((t) => typeof t === "string" && TYPE_RE.test(t))) errors.push("Legal types must be document type ids.");
  const categoryRoles: PbSettings["categoryRoles"] = {};
  for (const [c, roles] of Object.entries((o.categoryRoles ?? {}) as Record<string, unknown>)) {
    if (!/^[a-z]{1,4}$/.test(c) || !Array.isArray(roles) || !roles.every((r) => typeof r === "string" && ROLE_RE.test(r))) { errors.push(`The roles for category "${c}" are not valid.`); continue; }
    categoryRoles[c] = [...new Set(roles as string[])];
  }
  const ret = (o.retentionMonths ?? {}) as { default?: unknown; byType?: Record<string, unknown> };
  const months = (v: unknown, where: string): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 1200) return v;
    errors.push(`${where}: retention is a whole number of months from 1 to 1200, or empty.`);
    return null;
  };
  const retByType: Record<string, number | null> = {};
  for (const [t, v] of Object.entries(ret.byType ?? {})) {
    if (!TYPE_RE.test(t)) { errors.push(`"${t}" is not a document type.`); continue; }
    retByType[t] = months(v, `Retention for ${t}`);
  }
  const retDefault = months(ret.default, "Default retention");
  const aiIn = (o.ai ?? {}) as Record<string, unknown>;
  const aiInt = (k: keyof AiSettings, min: number, max: number): number => {
    const v = aiIn[k];
    if (v === undefined) return DEFAULT_SETTINGS.ai[k] as number;
    if (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max) return v;
    errors.push(`AI: ${k} is a whole number from ${min} to ${max}.`);
    return DEFAULT_SETTINGS.ai[k] as number;
  };
  const ai: AiSettings = {
    enabled: aiIn.enabled === undefined ? true : typeof aiIn.enabled === "boolean" ? aiIn.enabled : (errors.push("AI: enabled must be yes or no."), true),
    model: aiIn.model === undefined || aiIn.model === null || aiIn.model === "" ? null : typeof aiIn.model === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(aiIn.model) ? aiIn.model : (errors.push("AI: the model name is not valid."), null),
    perUserPerMinute: aiInt("perUserPerMinute", 1, 60), perUserPerDay: aiInt("perUserPerDay", 1, 5000), perCompanyPerDay: aiInt("perCompanyPerDay", 1, 100000), maxOutputTokens: aiInt("maxOutputTokens", 500, 16000),
  };
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      numbering: { default: numDefault, byType: numByType }, approval: { default: appDefault, byType: appByType },
      legalTypes: [...new Set(legalTypes as string[])], categoryRoles, retentionMonths: { default: retDefault, byType: retByType }, ai,
    },
  };
}

export type SettingsResult = { ok: true; settings: PbSettings } | { ok: false; error: string; errors?: string[] };

/** Saves the settings. Needs SETTINGS; retention periods and category access also need MANAGE_RETENTION and SETTINGS respectively (SETTINGS covers both). */
export async function savePbSettings(actor: PbActor, input: unknown): Promise<SettingsResult> {
  if (!playbookCan(actor, "SETTINGS")) return { ok: false, error: "You are not allowed to change document settings." };
  const v = validateSettings(input);
  if (!v.ok) return { ok: false, error: v.errors[0], errors: v.errors };
  const before = await getPbSettings();
  if (JSON.stringify(before.retentionMonths) !== JSON.stringify(v.value.retentionMonths) && !playbookCan(actor, "MANAGE_RETENTION")) {
    return { ok: false, error: "Only someone allowed to manage retention can change retention periods." };
  }
  await (await col()).updateOne({ _id: "main" }, { $set: { ...v.value, updatedAt: new Date(), updatedBy: actor.id } }, { upsert: true });
  await recordPbAudit({ actor, action: "settings", entity: "settings", entityId: "main", summary: "Changed document settings" });
  return { ok: true, settings: v.value };
}

/** The approval policy `documents.ts` uses unless something replaces it: reads the company's settings on every call. */
export const settingsStatusPolicy: StatusPolicy = {
  async autoApproveOnSubmit(ctx: PolicyContext) {
    // Only the author's own document: someone submitting another person's draft still goes to review.
    if (ctx.createdBy === null || ctx.submittedBy !== ctx.createdBy) return false;
    const r = approvalFor(await getPbSettings(), ctx.docTypeId);
    return r.autoApproveOwn && !r.requireDifferentApprover;
  },
  async requireDifferentApprover(ctx: PolicyContext) {
    return approvalFor(await getPbSettings(), ctx.docTypeId).requireDifferentApprover;
  },
};
