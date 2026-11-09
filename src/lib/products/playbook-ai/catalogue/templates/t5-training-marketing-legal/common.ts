/** Shared kit for batch T5 (training, marketing, compliance and legal): layouts, never-invent lists and small block helpers. */
import { bullets, each, f, kv, p, when } from "@/lib/products/playbook-ai/catalogue/build";
import type { InputField, LayoutTokens, RawBlock } from "@/lib/products/playbook-ai/catalogue/types";

export const DOC_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "left" };
export const FORM_LAYOUT: LayoutTokens = { header: "compact", footer: "page_numbers", titleAlign: "left" };
/** Brochures, profiles and other public collateral: the company letterhead and plain page numbers. */
export const COLLATERAL_LAYOUT: LayoutTokens = { header: "letterhead", footer: "page_numbers", titleAlign: "left" };
export const CERTIFICATE_LAYOUT: LayoutTokens = { header: "letterhead", footer: "none", titleAlign: "center" };
export const POLICY_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "center" };
export const NOTICE_LAYOUT: LayoutTokens = { header: "letterhead", footer: "doc_number_page", titleAlign: "center" };

export const NEVER_TRAINING = [
  "names, dates, scores, numbers, durations or results that are not in the provided facts",
  "trainers, courses, certifications or accreditations that were not named in the inputs",
  "statutory training requirements (say 'as required by applicable law' instead of naming a rule)",
];

export const NEVER_MARKETING = [
  "claims, awards, rankings, certifications, accreditations or partnerships that are not in the provided facts",
  "client names, testimonials, quotes, case results, statistics, prices or comparisons with competitors that were not supplied",
  "superlatives such as 'best', 'leading' or 'number one' unless the facts state them",
];

export const NEVER_LEGAL = [
  "statutes, sections, rules, courts, authorities, time limits or penalties that are not in the provided facts (write 'as per applicable law' instead)",
  "rights, duties, remedies or promises beyond the fixed clauses and the user's inputs",
  "names, addresses, amounts, dates or numbers that are not in the provided facts",
];

/** Text field for a contact or fact line the user supplies. */
export const optionalText = (key: string, label: string, help?: string): InputField => f.text(key, label, { required: false, ...(help ? { help } : {}) });

/** One bullet per row, from a template string that uses `item.<column>`. */
export const listRows = (source: string, text: string): RawBlock => each(source, "item", [bullets([text])]);

/** Prepared-by, date and reference block at the top of an internal training document. */
export const trainingHeader = (extra: [string, string][] = []): RawBlock =>
  kv([...extra, ["Prepared by", "{{author.name}}"], ["Date", "{{date.today|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]);

/** The company's own contact details, as held in its profile. Anything missing is reported by the missing-data check, never invented. */
export const companyContact = (): RawBlock =>
  kv([["Company", "{{company.legal_name}}"], ["Address", "{{company.address}}"], ["Email", "{{company.email}}"], ["Phone", "{{company.phone}}"], ["Website", "{{company.website}}"]]);

export const blankLine = (label: string): RawBlock => p(`${label}: ______________________________`);

/** Shown only when an optional input was left empty. */
export const whenUnset = (key: string, children: RawBlock[]): RawBlock => when(key, "not_exists", undefined, children);
