/** Shared kit for batch T3 (management, operations, IT and security): inputs, layouts and blocks for internal documents. */
import { bullets, each, f, kv, p, sig } from "@/lib/products/playbook-ai/catalogue/build";
import type { InputField, LayoutTokens, RawBlock } from "@/lib/products/playbook-ai/catalogue/types";

export const DOC_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "left" };
export const POLICY_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "center" };
export const LETTER_LAYOUT_T3: LayoutTokens = { header: "letterhead", footer: "doc_number_page", titleAlign: "center" };

export const NEVER_BIZ = [
  "figures, dates, names, percentages, targets or results that are not in the provided facts",
  "decisions, approvals or commitments that were not stated in the facts",
  "claims about customers, competitors, markets or regulators that were not supplied",
];
export const NEVER_POLICY = [
  "limits, time periods, thresholds or penalties that are not in the inputs",
  "legal or statutory requirements, rates or deadlines (say 'as required by applicable law' instead)",
  "tools, systems, products or roles that are not named in the inputs",
];

export const owner = (): InputField => f.text("owner", "Document owner", { help: "The person or role accountable for this document." });
export const effective = (): InputField => f.date("effective_date", "Effective from");
export const policyInputs = (): InputField[] => [owner(), effective()];

/** Owner, date and reference block at the top of an internal document. */
export const docHeader = (extra: [string, string][] = []): RawBlock =>
  kv([["Owner", "{{input.owner}}"], ["Date", "{{date.today|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"], ...extra]);

export const policyHeader = (): RawBlock =>
  kv([["Owner", "{{input.owner}}"], ["Effective from", "{{input.effective_date|date}}"], ["Applies to", "All employees, contractors and others who use or work with {{company.legal_name}}'s systems, information and premises"], ["Reference", "{{doc.number||To be assigned on issue}}"]]);

/** One bullet per row, from a template string that uses `item.<column>`. */
export const listRows = (source: string, text: string): RawBlock => each(source, "item", [bullets([text])]);

export const AMEND_POLICY = "This policy is reviewed regularly by its owner and may be amended from time to time. Where it differs from applicable law, applicable law prevails. Exceptions need the written approval of the policy owner.";
export const approvals = (...labels: string[]): RawBlock[] => [p("Approved by:"), ...labels.map((l, i) => sig(l, i === 0 ? "company_signatory" : "approver"))];
