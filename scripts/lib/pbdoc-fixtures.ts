/** Raw PBDoc fixtures (no ids; the parser assigns deterministic ids) used by the Playbook model tests and golden files. */
import { DEFAULT_PAGE } from "../../src/lib/products/playbook-ai/doc/page";

const t = (text: string, marks?: unknown[]) => (marks ? { type: "text", text, marks } : { type: "text", text });
const v = (key: string, format?: string, fallback?: string) => ({ type: "var", key, ...(format ? { format } : {}), ...(fallback ? { fallback } : {}) });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const bold = [{ type: "bold" }];

/** A realistic offer letter exercising every node type. */
export function offerLetterRaw() {
  return {
    schemaVersion: 1,
    lang: "en",
    page: DEFAULT_PAGE,
    header: [
      p(v("company.legal_name", "upper")),
      p(v("company.address_line"), { type: "hardBreak" }, t("CIN: "), v("company.cin")),
      { type: "divider" },
    ],
    footer: [
      { type: "divider" },
      { type: "paragraph", align: "center", content: [{ type: "field", field: "docNumber" }, t("  |  Page "), { type: "field", field: "pageNumber" }, t(" of "), { type: "field", field: "totalPages" }] },
    ],
    body: [
      { type: "heading", level: 1, align: "center", content: [t("Offer of Employment")] },
      { type: "toc", levels: 2 },
      {
        type: "section", key: "intro", title: "Introduction", aiMode: "generate", locked: false,
        children: [
          p(t("Date: "), v("doc.date", "date")),
          p(t("Dear "), v("candidate.name", undefined, "Candidate"), t(",")),
          p(t("We are pleased to offer you the position of "), v("input.designation"), t(" at "), v("company.name", undefined, "the Company"), t(". Your joining date will be "), v("input.joining_date", "date"), t(".")),
        ],
      },
      {
        type: "section", key: "compensation", title: "Compensation", aiMode: "table", locked: false,
        children: [
          { type: "heading", level: 2, content: [t("Compensation")] },
          {
            type: "table", colWidths: [60, 40], headerRow: true,
            rows: [
              { cells: [{ content: [p(t("Component", bold))] }, { align: "right", content: [p(t("Annual amount", bold))] }] },
              { cells: [{ content: [p(t("Annual CTC"))] }, { align: "right", content: [p(v("input.annual_ctc", "money"))] }] },
              { cells: [{ content: [p(t("Amount in words"))] }, { align: "right", content: [p(v("input.annual_ctc", "words"))] }] },
            ],
          },
          { type: "callout", variant: "info", content: [p(t("Figures are before statutory deductions and are subject to the company's payroll policy."))] },
        ],
      },
      {
        type: "section", key: "terms", title: "Terms of employment", aiMode: "fixed", locked: true,
        children: [
          { type: "heading", level: 2, content: [t("Terms of employment")] },
          { type: "clause", level: 1, numbered: true, content: [t("Probation", bold)] },
          { type: "clause", level: 2, numbered: true, content: [t("You will be on probation for "), v("input.probation_months"), t(" months from the date of joining.")] },
          { type: "clause", level: 3, numbered: true, content: [t("The company may confirm or extend probation in writing.")] },
          { type: "clause", level: 3, numbered: true, content: [t("Notice during probation is "), v("input.probation_notice_days"), t(" days.")] },
          { type: "clause", level: 1, numbered: true, content: [t("Confidentiality", bold)] },
          { type: "clause", level: 2, numbered: false, content: [t("You will keep the company's confidential information secret, with "), t("no exceptions", [{ type: "underline" }, { type: "bold" }]), t(" other than disclosure required by law.")] },
          {
            type: "conditional", when: { key: "input.relocation", op: "eq", value: "yes" },
            children: [{ type: "clause", level: 1, numbered: true, content: [t("Relocation assistance of "), v("input.relocation_amount", "money"), t(" will be paid on joining.")] }],
          },
        ],
      },
      {
        type: "section", key: "benefits", title: "Benefits", aiMode: "facts", locked: false,
        children: [
          { type: "heading", level: 2, content: [t("Benefits")] },
          { type: "repeat", source: "input.benefits", itemVar: "item", children: [{ type: "bulletList", items: [{ content: [p(v("item.name"), t(": "), v("item.detail"))] }] }] },
          {
            type: "orderedList", style: "alpha",
            items: [
              { content: [p(t("Joining formalities"))] },
              { content: [p(t("Documents to submit")), { type: "bulletList", items: [{ content: [p(t("Identity proof"))] }, { content: [p(t("Relieving letter from "), { type: "placeholder", key: "input.previous_employer", label: "Previous employer", hint: "Name of the last employer" })] }] }] },
              { content: [p(t("See "), t("the policy portal", [{ type: "link", href: "https://example.com/policies" }]), t("."))] },
            ],
          },
        ],
      },
      { type: "pageBreak" },
      {
        type: "section", key: "acceptance", title: "Acceptance", aiMode: "fixed", locked: false,
        children: [
          p(t("Please sign and return a copy of this letter to confirm your acceptance.")),
          { type: "spacer", heightMm: 12 },
          { type: "signatureBlock", label: "For the Company", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true },
          { type: "signatureBlock", label: "Accepted by the Candidate", partyRole: "counterparty", showName: true, showDesignation: false, showDate: true },
        ],
      },
    ],
  };
}

export const minimalRaw = () => ({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] });

const SENTENCE = "The parties agree that the services will be delivered in accordance with the agreed scope, timelines and quality standards, and that any change will be recorded in writing and approved by both parties before it takes effect.";

/** A long document: `sections` sections, each with a heading, `paras` paragraphs, a clause group and optionally a table. Used for pagination, TOC and performance tests. */
export function longDocRaw(opts: { sections: number; paras?: number; tables?: boolean; toc?: boolean; clauses?: number }) {
  const paras = opts.paras ?? 3;
  const body: unknown[] = [{ type: "heading", level: 1, content: [t("Master Services Agreement")] }];
  if (opts.toc) body.push({ type: "toc", levels: 2 });
  for (let s = 1; s <= opts.sections; s++) {
    body.push({ type: "heading", level: 2, content: [t(`Section ${s} Scope and Deliverables`)] });
    for (let i = 0; i < paras; i++) body.push(p(t(`${SENTENCE} (${s}.${i + 1})`)));
    for (let c = 0; c < (opts.clauses ?? 0); c++) body.push({ type: "clause", level: c % 3 === 0 ? 1 : 2, numbered: true, content: [t(SENTENCE)] });
    if (opts.tables) {
      body.push({
        type: "table", colWidths: [40, 30, 30], headerRow: true,
        rows: Array.from({ length: 6 }, (_, r) => ({ cells: ["Item", "Quantity", "Amount"].map((h, ci) => ({ align: ci ? "right" : "left", content: [p(t(r === 0 ? h : ci === 0 ? `Deliverable ${s}-${r}` : ci === 1 ? String(r * 3) : `Rs ${(r * 12500).toLocaleString("en-IN")}`))] })) })),
      });
    }
  }
  body.push({ type: "signatureBlock", label: "Authorised signatory", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true });
  return {
    schemaVersion: 1, lang: "en", page: DEFAULT_PAGE,
    header: [{ type: "paragraph", content: [t("Orbit Software Private Limited")] }, { type: "divider" }],
    footer: [{ type: "paragraph", align: "center", content: [t("Page "), { type: "field", field: "pageNumber" }, t(" of "), { type: "field", field: "totalPages" }] }],
    body,
  };
}

/** Values that fill the offer-letter fixture completely. */
export const OFFER_VALUES = {
  "company.legal_name": "Orbit Software Private Limited", "company.address_line": "Unit 4, Tech Park, Andheri East, Mumbai 400093", "company.cin": "U72900MH2020PTC123456",
  "company.name": "Orbit", "doc.date": "2026-11-05", "candidate.name": "Asha Rao", "input.designation": "Senior Engineer", "input.joining_date": "2026-12-01",
  "input.annual_ctc": 1800000, "input.probation_months": 6, "input.probation_notice_days": 15, "input.relocation": "yes", "input.relocation_amount": 50000,
  "input.previous_employer": "Nimbus Labs",
};
export const OFFER_LISTS = { "input.benefits": [{ name: "Health insurance", detail: "Rs 5,00,000 family floater" }, { name: "Learning budget", detail: "Rs 40,000 a year" }] };
