/**
 * Company templates: types, constants and the validation of what a company may change. Pure, client-safe (no database).
 *
 * A company template is a `TemplateDef` (the catalogue's own schema: inputs, sections with PBDoc skeletons and AI instructions, layout, page)
 * that belongs to one company, plus bookkeeping: where it came from, its immutable published versions, who reviewed it, and the
 * numbering prefix and approval policy it asks for. Platform starters stay in code and are listed read-only; "Make my copy" copies one
 * into the company's own templates, after which the company owns it and nothing the platform ships can overwrite it.
 */

import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { CATEGORY_KEYS, type CategoryKey } from "@/lib/products/playbook-ai/catalogue/types";
import { validateTemplateDef, type CatalogueIssue } from "@/lib/products/playbook-ai/catalogue/validate";
import { ALL_META } from "@/lib/products/playbook-ai/catalogue/meta";

export const TEMPLATE_STATUSES = ["draft", "published", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export type TemplateOrigin =
  /** Copied from a platform starter. `baseVersion` is the starter version copied; `base` is a frozen copy of that starter, used to tell what the platform changed from what the company changed. */
  | { kind: "starter"; starterId: string; baseVersion: number; base: TemplateDef }
  | { kind: "scratch" };

export interface TemplateReview {
  by: { id: string; name: string | null };
  on: Date;
  /** Hash of the template content that was reviewed. The stamp counts only while the content still has this hash. */
  contentSha256: string;
}

/** The approval policy a template asks for. `undefined` fields fall back to the company setting for the type. */
export interface TemplateApproval {
  requireDifferentApprover?: boolean;
  autoApproveOwn?: boolean;
}

export interface TemplateRecord {
  _id: string;
  /** Document type id (`hr.offer`, or `ct.my_nda` for a template created from scratch). New documents record it as `docTypeId`. */
  typeId: string;
  name: string;
  origin: TemplateOrigin;
  status: TemplateStatus;
  /** The working copy the company edits. Not used for new documents until it is published. */
  def: TemplateDef;
  /** Increases on every save of the working copy; a save carries the `rev` it was based on (conflict detection). */
  rev: number;
  /** The published version new documents use, or null before the first publish. */
  publishedVersion: number | null;
  /** Last version number handed out. */
  versionSeq: number;
  /** Hash of the working copy's content (see `templateContentHash`). */
  contentSha256: string;
  review: TemplateReview | null;
  /** Numbering prefix this template asks for (replaces the catalogue's suggestion for this type). */
  numberingPrefix: string | null;
  approval: TemplateApproval | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export interface TemplateVersionRecord {
  _id: string;
  templateId: string;
  typeId: string;
  number: number;
  name: string;
  def: TemplateDef;
  contentSha256: string;
  note: string | null;
  numberingPrefix: string | null;
  approval: TemplateApproval | null;
  /** Review stamp that applied to exactly this content at publish time (or was set on it afterwards). */
  review: TemplateReview | null;
  publishedBy: string | null;
  publishedAt: Date;
}

/** Sections that exist only to carry drafting notices. The issue step removes them from the issued document. */
/** `registration_notice` is the lease template's reminder that registration may be needed. A test fails if the catalogue adds a draft-only key that is not listed here. */
export const DRAFT_ONLY_SECTION_KEYS = ["legal_notice", "verify_notice", "registration_notice"] as const;
/** A company's own drafting-only section uses this key prefix (the catalogue's two notices are listed above). */
export const DRAFT_ONLY_PREFIX = "draft_";
export const isDraftOnlySectionKey = (key: string): boolean => (DRAFT_ONLY_SECTION_KEYS as readonly string[]).includes(key) || key.startsWith(DRAFT_ONLY_PREFIX);

export const NUMBERING_PREFIX_RE = /^[A-Z][A-Z0-9-]{1,19}$/;
export const TEMPLATE_NAME_MAX = 120;

const CATALOGUE_IDS = new Set(ALL_META.map((m) => m.id));
export const isCatalogueId = (id: string): boolean => CATALOGUE_IDS.has(id);

/** `ct.my_nda` from a category and a name. */
export function slugTypeId(category: CategoryKey, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "template";
  return `${category}.${/^[a-z]/.test(slug) ? slug : `t_${slug}`}`;
}

export type TemplateValidation = { ok: true; def: TemplateDef } | { ok: false; error: string; issues: CatalogueIssue[] };

/**
 * Validates what a company may save: the full catalogue validator (metadata, inputs, sections, PBDoc skeleton, cross references) plus
 * the rules that only apply to company templates: the id is stable, a template made from scratch cannot reuse a catalogue id, a section
 * marked draft-only needs the draft key, and the legal and statute flags of a copied starter cannot be switched off.
 */
export function validateCompanyTemplate(def: TemplateDef, ctx: { origin: TemplateOrigin; typeId: string }): TemplateValidation {
  const issues: CatalogueIssue[] = [];
  if (def.id !== ctx.typeId) issues.push({ path: "id", message: "the document type id of a template cannot change" });
  if (ctx.origin.kind === "scratch" && isCatalogueId(def.id)) issues.push({ path: "id", message: "that type id belongs to a platform starter" });
  if (ctx.origin.kind === "starter") {
    const base = ctx.origin.base;
    if (base.legal.review && !def.legal.review) issues.push({ path: "legal.review", message: "the legal review flag of a starter cannot be switched off" });
    if (base.legal.statute && !def.legal.statute) issues.push({ path: "legal.statute", message: "the statute flag of a starter cannot be switched off" });
  }
  def.sections?.forEach((s, i) => {
    if (s.draftOnly && !isDraftOnlySectionKey(s.key)) issues.push({ path: `sections[${i}].key`, message: `a draft-only section's key must be one of the notice keys or start with "${DRAFT_ONLY_PREFIX}"` });
    if (!s.draftOnly && s.key.startsWith(DRAFT_ONLY_PREFIX)) issues.push({ path: `sections[${i}].draftOnly`, message: `a section whose key starts with "${DRAFT_ONLY_PREFIX}" is removed at issue, so it must be marked draft-only` });
  });
  const v = validateTemplateDef(def);
  issues.push(...v.issues);
  if (issues.length) return { ok: false, error: `${issues[0].path ? `${issues[0].path}: ` : ""}${issues[0].message}`, issues };
  return { ok: true, def };
}

export type PolicyValidation = { ok: true; numberingPrefix: string | null; approval: TemplateApproval | null } | { ok: false; error: string };

export function validatePolicy(input: { numberingPrefix?: unknown; approval?: unknown }): PolicyValidation {
  let numberingPrefix: string | null = null;
  if (input.numberingPrefix !== undefined && input.numberingPrefix !== null && input.numberingPrefix !== "") {
    if (typeof input.numberingPrefix !== "string" || !NUMBERING_PREFIX_RE.test(input.numberingPrefix)) return { ok: false, error: "The numbering prefix must be 2 to 20 upper-case letters, digits or hyphens." };
    numberingPrefix = input.numberingPrefix;
  }
  let approval: TemplateApproval | null = null;
  if (input.approval !== undefined && input.approval !== null) {
    const a = input.approval as Record<string, unknown>;
    if (typeof a !== "object" || Array.isArray(a)) return { ok: false, error: "The approval policy is not valid." };
    const out: TemplateApproval = {};
    for (const k of ["requireDifferentApprover", "autoApproveOwn"] as const) {
      if (a[k] === undefined || a[k] === null) continue;
      if (typeof a[k] !== "boolean") return { ok: false, error: `The approval setting "${k}" must be true or false.` };
      out[k] = a[k] as boolean;
    }
    if (out.requireDifferentApprover === true && out.autoApproveOwn === true) return { ok: false, error: "A template cannot both require a different approver and approve the author's own document." };
    approval = Object.keys(out).length ? out : null;
  }
  return { ok: true, numberingPrefix, approval };
}

export { CATEGORY_KEYS };
export type { CategoryKey, TemplateDef };
