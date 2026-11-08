/**
 * Playbook template catalogue: types. Pure, client-safe (no server-only imports).
 *
 * Two layers, so the catalogue can be complete (all 184 types) long before every template is written:
 *  - `CatalogueMeta`: the metadata row for every document type (id, category, party, signature, legal, stamp, inputs and sections summary).
 *  - `TemplateDef`: a catalogue row PLUS full content: an inputs form, ordered sections with PBDoc skeleton bodies, AI instructions,
 *    page/header/footer layout tokens. A `TemplateDef` is validated by `validateTemplateDef` (validate.ts) against the PBDoc validator.
 *
 * Starter templates live in code; "Use this template" copies one into the company's own templates (plan section 3.2).
 */

import type { PageSettings } from "@/lib/products/playbook-ai/doc/page";

// ---------------------------------------------------------------------------
// Categories, parties, signature, legal, stamp, retention
// ---------------------------------------------------------------------------

export const CATEGORY_KEYS = ["hr", "mg", "op", "it", "vn", "ps", "ct", "tr", "mk", "fn", "lg"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  hr: "HR and employee lifecycle",
  mg: "Management",
  op: "Operations",
  it: "IT and security",
  vn: "Vendor",
  ps: "Pre-sale",
  ct: "Contracts",
  tr: "Training",
  mk: "Marketing",
  fn: "Finance",
  lg: "Compliance and legal",
};

export const PARTY_TYPES = ["client", "vendor", "employee", "candidate", "partner", "freelancer", "trainee", "other", "none"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** Who reads the document: only the company (internal), a named external party, or the public/an audience. */
export const AUDIENCES = ["internal", "external", "public"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** yes = sent to ContractFlow for e-signature by default; optional = the user may send it; no = never signed. */
export const SIGN_MODES = ["yes", "optional", "no"] as const;
export type SignMode = (typeof SIGN_MODES)[number];

export const STAMP_RULES = ["none", "maybe", "likely"] as const;
export type StampRule = (typeof STAMP_RULES)[number];

/**
 * Instrument category keys: EXACTLY the keys of the stamp rulebook (`INSTRUMENT_CATEGORIES` in contractflow-ai/stamp/structure.ts). A template
 * only NAMES a category; the duty per state is platform reference data that a legal reviewer confirms. No amounts live in the catalogue.
 * scripts/test-pb-catalogue.ts checks this list against the rulebook so they cannot drift.
 */
export const STAMP_CATEGORIES = [
  "agreement", "service_agreement", "nda", "mou", "employment", "lease", "indemnity", "guarantee", "loan", "power_of_attorney", "affidavit",
  "partnership_deed", "sale_of_goods", "other",
] as const;
export type StampCategory = (typeof STAMP_CATEGORIES)[number];

/** Suggested retention classes. A hint only: the company configures the actual period per document type (decision 7). */
export const RETENTION_KEYS = [
  "employment_record", "recruitment", "contract", "policy", "finance", "statutory", "operations", "project", "vendor", "sales",
  "training", "marketing", "legal", "security", "general",
] as const;
export type RetentionKey = (typeof RETENTION_KEYS)[number];

export interface LegalFlags {
  /** L: the in-product notice "AI draft. Needs review by a qualified advocate before use" is mandatory. */
  review: boolean;
  /** C: statute-sensitive; verify against current Indian law and the company's registered details. */
  statute: boolean;
}

export interface StampInfo {
  rule: StampRule;
  /** Required when `rule` is not "none". */
  category?: StampCategory;
}

// ---------------------------------------------------------------------------
// Catalogue metadata (one row per document type)
// ---------------------------------------------------------------------------

export interface CatalogueMeta {
  /** `<category>.<slug>`, e.g. `hr.offer`. The prefix equals `category`. Never changes once shipped. */
  id: string;
  name: string;
  category: CategoryKey;
  purpose: string;
  party: PartyType;
  audience: Audience;
  sign: SignMode;
  /** True when `sign` is "yes" or "optional": the document carries signature blocks. */
  needsSignature: boolean;
  legal: LegalFlags;
  /** E-sign-ineligible or special (wet signature / registration): the "Send for signature" button is hidden. */
  esignIneligible: boolean;
  stamp: StampInfo;
  retentionKey: RetentionKey;
  /** Default numbering prefix used in `{PREFIX}/{FY}/{SEQ}`. */
  numberingPrefix: string;
  /** The minimum the user must supply (plan section 8 "Required inputs"). */
  inputsSummary: string[];
  /** The planned skeleton (plan section 8 "Sections"). */
  sectionsSummary: string[];
}

// ---------------------------------------------------------------------------
// Inputs form schema
// ---------------------------------------------------------------------------

export const INPUT_TYPES = ["text", "longtext", "number", "money", "date", "select", "multiselect", "yesno", "person", "rows"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

/** Namespaces a person/party picker can fill. The picked record's fields become `<namespace>.*` variables. */
export const PICKER_NAMESPACES = ["employee", "candidate", "client", "vendor", "project", "party"] as const;
export type PickerNamespace = (typeof PICKER_NAMESPACES)[number];

export interface SelectOption { value: string; label: string }

export const ROW_COLUMN_TYPES = ["text", "number", "money", "date"] as const;
export type RowColumnType = (typeof ROW_COLUMN_TYPES)[number];
export interface RowColumn { key: string; label: string; type: RowColumnType; required?: boolean }

/** Show this input only when another (earlier) input has this value. */
export interface ShowWhen { key: string; equals: string }

export interface InputField {
  /** Lower-case name; the document variable is `input.<key>`. */
  key: string;
  label: string;
  type: InputType;
  required: boolean;
  help?: string;
  placeholder?: string;
  /** select / multiselect. */
  options?: SelectOption[];
  /** person: the namespace this picker fills. */
  picker?: PickerNamespace;
  /** rows: the columns of each row. */
  columns?: RowColumn[];
  minRows?: number;
  maxRows?: number;
  /** number / money: inclusive bounds. text / longtext: `maxLength`. */
  min?: number;
  max?: number;
  maxLength?: number;
  /** Default value, as the user would type it (a string, or "yes"/"no" for yesno). */
  defaultValue?: string;
  /** Variables that can auto-fill this input, tried in order (e.g. ["employee.designation"]). The user can always override. */
  bindings?: string[];
  showWhen?: ShowWhen;
  /** Sections whose AI generation or content uses this input (beyond direct variable use). */
  feedsSections?: string[];
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * fixed  = static wording, no AI (lawyer-style clauses; locked by default).
 * ai     = the AI writes the section from the inputs and the fact bag.
 * hybrid = fixed skeleton clauses with AI-written narrative parts.
 */
export const TEMPLATE_AI_MODES = ["fixed", "ai", "hybrid"] as const;
export type TemplateAiMode = (typeof TEMPLATE_AI_MODES)[number];

export const AI_TONES = ["formal", "warm", "firm", "neutral", "instructional"] as const;
export type AiTone = (typeof AI_TONES)[number];

export interface AiInstructions {
  tone: AiTone;
  minWords: number;
  maxWords: number;
  /** What to write, in one or two sentences. */
  brief: string;
  /** Fact keys the section may use: variable keys (`employee.full_name`) or input keys (`input.reason`). */
  allowedFacts: string[];
  /** What must never be invented. Required, at least one entry. */
  neverInvent: string[];
}

/** A raw (id-less) PBDoc block: the PBDoc parser assigns ids and rejects anything invalid. Built with the helpers in build.ts. */
export type RawBlock = Record<string, unknown>;

export interface TemplateSection {
  /** Lower-case key, unique in the template; also the PBDoc section key. */
  key: string;
  title: string;
  aiMode: TemplateAiMode;
  /** Locked sections cannot be edited or regenerated by AI. Fixed legal wording should be locked. */
  locked: boolean;
  /** Present for `ai` and `hybrid` sections, absent for `fixed`. */
  ai?: AiInstructions;
  /** Sections whose content is context for this one (must exist, not itself). */
  dependsOn?: string[];
  /** Shown in drafts only (drafting notices); the issue step removes it. */
  draftOnly?: boolean;
  /** Do not print the section title as a heading (the body supplies its own, e.g. a letter's opening). */
  noHeading?: boolean;
  /** The PBDoc skeleton: blocks with variables, placeholders, conditionals and repeats. The section heading is added by the template. */
  body: RawBlock[];
}

// ---------------------------------------------------------------------------
// Layout tokens
// ---------------------------------------------------------------------------

export const HEADER_LAYOUTS = ["letterhead", "compact", "none"] as const;
export type HeaderLayout = (typeof HEADER_LAYOUTS)[number];
export const FOOTER_LAYOUTS = ["page_numbers", "doc_number_page", "confidential_page", "none"] as const;
export type FooterLayout = (typeof FOOTER_LAYOUTS)[number];

export interface LayoutTokens {
  header: HeaderLayout;
  footer: FooterLayout;
  /** Title (heading 1) alignment of the document. */
  titleAlign: "left" | "center";
  /** Start the section named here on a new page. */
  pageBreakBefore?: string[];
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

export interface TemplateDef extends CatalogueMeta {
  /** Bumped whenever the content changes; companies see "starter updated" against the version they copied. */
  version: number;
  lang: "en";
  /** The document title printed as heading 1 (may use variables). */
  title: string;
  inputs: InputField[];
  sections: TemplateSection[];
  page: PageSettings;
  layout: LayoutTokens;
  /** Required for legal.review templates: the verbatim review notice. */
  legalBanner?: string;
  /** Required for legal.statute templates. */
  statuteNotice?: string;
  /** Other standing notes shown with the template (not printed). */
  disclaimers: string[];
}

/** A catalogue entry as listed: the metadata, and whether full content exists yet. */
export interface CatalogueEntry {
  meta: CatalogueMeta;
  hasContent: boolean;
}

export const LEGAL_REVIEW_BANNER = "AI draft. Needs review by a qualified advocate before use.";
export const STATUTE_NOTICE = "Verify against current law and your registered details before use. Statutory figures must come from your payroll and compliance records, not from this draft.";
