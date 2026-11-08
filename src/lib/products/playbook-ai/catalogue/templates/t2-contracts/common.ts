/**
 * Shared kit for the contract templates (batch T2): input factories, standard fixed clauses and the execution block.
 * The clauses are plain, conventional commercial wording under Indian law. They carry no figures: every period, amount and limit is an
 * input the user supplies. All contract templates are legal-review types and ship UNREVIEWED.
 */
import { c1, c2, f, p, sig, whenNo, whenSet, whenYes, lockedSection } from "@/lib/products/playbook-ai/catalogue/build";
import type { InputField, LayoutTokens, RawBlock, TemplateSection } from "@/lib/products/playbook-ai/catalogue/types";

export type CounterNs = "client" | "vendor" | "party" | "employee";

export const CONTRACT_LAYOUT: LayoutTokens = { header: "compact", footer: "doc_number_page", titleAlign: "center", pageBreakBefore: ["execution"] };

export const NEVER_CONTRACT = [
  "parties, dates, amounts, percentages, periods or numbers that are not in the provided facts",
  "obligations, warranties, indemnities, liabilities or remedies beyond those in the fixed clauses",
  "statutory references, tax rates or legal conclusions",
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const I = {
  counter: (ns: CounterNs, label: string, help?: string): InputField => f.person(ns, label, ns, { help: help ?? `Pick or enter the ${label.toLowerCase()}. Name and address come from the record.` }),
  effective: (): InputField => f.date("effective_date", "Effective date"),
  termMonths: (label = "Initial term (months)"): InputField => f.number("term_months", label, { min: 1, max: 600 }),
  autoRenew: (): InputField => f.yesno("auto_renew", "Renew automatically at the end of the term?", { help: "If yes, the agreement renews for periods equal to the initial term unless a party gives notice." }),
  noticeDays: (): InputField => f.number("notice_days", "Notice to end without cause (days)", { min: 0, max: 365, help: "Use the commercial terms agreed with the other party." }),
  cureDays: (): InputField => f.number("cure_days", "Days to remedy a breach", { min: 1, max: 180, help: "Time allowed to fix a breach after written notice." }),
  paymentDays: (): InputField => f.number("payment_days", "Days to pay an invoice", { min: 0, max: 180, help: "Use the commercial terms agreed with the other party." }),
  city: (): InputField => f.text("jurisdiction_city", "City for courts and arbitration seat", { help: "For example the city where the company is based." }),
  stamp: (): InputField => f.select("stamp_borne_by", "Who bears the stamp duty", ["The Company", "The other party", "Both parties equally"], { help: "Stamp duty is payable as the law of the state of execution requires." }),
  liabilityCap: (): InputField => f.money("liability_cap", "Liability cap (amount)", { required: false, help: "Leave blank to cap liability at the fees paid and payable under the agreement." }),
  witnesses: (): InputField => f.yesno("witnesses", "Add witness signature blocks?", { help: "Some parties and states prefer witnessed signatures." }),
  survival: (): InputField => f.number("survival_months", "Confidentiality continues after the agreement ends (months)", { min: 1, max: 600 }),
};

/** The inputs almost every contract carries; pass extras after them. */
export const baseTail = (): InputField[] => [I.city(), I.stamp(), I.witnesses()];

// ---------------------------------------------------------------------------
// Parties and execution
// ---------------------------------------------------------------------------

export function parties(ns: CounterNs, term: string, intro = "This agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:"): RawBlock[] {
  return [
    p(intro),
    p("**{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Company\"); and"),
    p(`**{{${ns}.name}}**, of {{${ns}.address}} (the "${term}").`),
    p(`The Company and the ${term} are each a "party" and together the "parties".`),
  ];
}

export function executionSection(term: string): TemplateSection {
  return lockedSection("execution", "Execution", [
    p(`The parties have signed this Agreement through their authorised signatories, to take effect on the Effective Date.`),
    sig("For the Company", "company_signatory"),
    sig(`For the ${term}`, "counterparty"),
    whenYes("input.witnesses", [sig("Witness one", "witness", { designation: false }), sig("Witness two", "witness", { designation: false })]),
  ]);
}

// ---------------------------------------------------------------------------
// Standard clauses
// ---------------------------------------------------------------------------

export function confidentiality(survival = true): RawBlock[] {
  return [
    c1("**Confidentiality.** Each party (the \"Recipient\") shall keep confidential all non-public information that the other party (the \"Discloser\") discloses in connection with this Agreement, whether in writing, orally or by inspection, that is marked confidential or that a reasonable person would understand to be confidential (\"Confidential Information\"), and shall use it only to perform this Agreement or receive its benefit."),
    c2("The Recipient shall protect Confidential Information with at least the care it uses for its own confidential information and never less than reasonable care, and shall disclose it only to its employees, advisers and subcontractors who need to know it and are bound by duties of confidentiality no less protective."),
    c2("This clause does not apply to information that the Recipient can show (a) is or becomes public other than through its breach; (b) was lawfully known to it before the disclosure; (c) was lawfully received from a third party free of any duty of confidence; or (d) was developed independently without use of Confidential Information."),
    c2("The Recipient may disclose Confidential Information to the extent a law, court or regulator requires, after giving the Discloser prompt notice where the law permits, so that the Discloser may seek protection."),
    c2("When the Discloser asks, or this Agreement ends, the Recipient shall return or destroy the Confidential Information and confirm in writing that it has done so, except for copies the law requires it to keep and routine backups, which remain subject to this clause."),
    ...(survival ? [c2("This clause continues for {{input.survival_months|number}} months after this Agreement ends and, for trade secrets, for as long as the information remains a trade secret.")] : []),
  ];
}

export function termination(): RawBlock[] {
  return [
    c1("**Termination.** Either party may end this Agreement by giving the other {{input.notice_days|number}} days' written notice."),
    c1("Either party may end this Agreement immediately by written notice if the other (a) commits a material breach and does not remedy it within {{input.cure_days|number}} days of written notice asking it to do so, or (b) becomes insolvent, enters liquidation or insolvency proceedings, or stops carrying on business."),
    c1("When this Agreement ends, the Company and the other party shall each pay what is due for work done and goods delivered up to the end date, shall return or destroy the other's materials and Confidential Information, and shall keep their other rights that have already arisen. Clauses that by their nature should continue, including confidentiality, intellectual property, liability, payment and governing law, continue after the end."),
  ];
}

export function liability(): RawBlock[] {
  return [
    c1("**Limitation of liability.** Neither party is liable to the other for indirect, special or consequential loss, or for loss of profit, revenue, goodwill or data, arising out of this Agreement, however caused."),
    whenSet("input.liability_cap", [c1("Subject to the next clause, each party's total liability to the other under or in connection with this Agreement is limited to {{input.liability_cap|money}} ({{input.liability_cap|words}}).")]),
    when_not("input.liability_cap", [c1("Subject to the next clause, each party's total liability to the other under or in connection with this Agreement is limited to the total fees paid and payable under it.")]),
    c1("Nothing in this Agreement limits or excludes liability for fraud or wilful misconduct, for breach of confidentiality or of intellectual property rights, for an indemnity given in this Agreement, or for any liability that cannot be limited or excluded by law."),
  ];
}
function when_not(key: string, children: RawBlock[]): RawBlock {
  return { type: "conditional", when: { key, op: "not_exists" }, children };
}

export function taxes(): RawBlock[] {
  return [
    c1("**Taxes.** All amounts under this Agreement are exclusive of goods and services tax and other indirect taxes, which the payer shall pay in addition, against a valid tax invoice. Each party bears its own income tax. The payer shall deduct tax at source where the law requires it, deposit it with the authorities and give the payee the certificate the law prescribes, and the amount so deducted counts as paid to the payee."),
  ];
}

export function generalProvisions(): RawBlock[] {
  return [
    c1("**Force majeure.** A party is not liable for delay or failure to perform (other than a payment obligation) caused by events beyond its reasonable control, such as natural disaster, epidemic, war, riot, government action or failure of public utilities, if it tells the other party promptly and uses reasonable efforts to resume performance. If the event continues for an unreasonable time, either party may end this Agreement by written notice."),
    c1("**Relationship.** The parties are independent contractors. Nothing in this Agreement makes either party the agent, employee, partner or joint venturer of the other, or allows either to bind the other."),
    c1("**Assignment and subcontracting.** Neither party may assign or transfer its rights or obligations under this Agreement without the other's prior written consent, except to a successor of its whole business that takes on all its obligations."),
    c1("**Notices.** A notice under this Agreement must be in writing and sent by hand, by courier or by email to the address of the receiving party stated in this Agreement or another address it notifies, and takes effect when received."),
    c1("**Entire agreement and changes.** This Agreement is the whole agreement between the parties on its subject and replaces earlier discussions and understandings. It may be changed only in writing signed by both parties."),
    c1("**Waiver and severability.** A failure or delay in exercising a right is not a waiver of it. If any provision is held invalid or unenforceable, the rest of this Agreement continues in force and the provision shall be replaced by a valid one that is as close as possible to the parties' intention."),
    c1("**Counterparts and electronic signature.** This Agreement may be signed in counterparts, and by electronic means to the extent the law permits, and each signed counterpart is an original and all together are one agreement."),
    c1("**Stamp duty.** Stamp duty and any registration charges payable on this Agreement shall be borne by {{input.stamp_borne_by}}. The parties shall ensure that this Agreement is duly stamped as the law of the state of execution requires before it is relied on in any proceeding."),
  ];
}

export function governingLaw(): RawBlock[] {
  return [
    c1("**Governing law.** This Agreement is governed by the laws of India."),
    c1("**Disputes.** The parties shall first try in good faith to settle any dispute arising out of or in connection with this Agreement by discussion between senior representatives. A dispute not settled in that way within a reasonable time shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed by agreement of the parties or, failing agreement, as that Act provides. The seat and venue of arbitration shall be {{input.jurisdiction_city}}, the language shall be English, and the award shall be final and binding."),
    c1("Subject to the arbitration clause, and for any application for interim relief or to enforce an award, the courts at {{input.jurisdiction_city}} have exclusive jurisdiction."),
  ];
}

/** Locked general sections used by most contracts: tax and general provisions, then governing law. */
export const generalSection = (): TemplateSection => lockedSection("general", "General provisions", [...taxes(), ...generalProvisions()]);
export const lawSection = (): TemplateSection => lockedSection("governing_law", "Governing law and disputes", governingLaw());
export const termSection = (): TemplateSection => lockedSection("term", "Term", [
  c1("This Agreement starts on the Effective Date and continues for an initial term of {{input.term_months|number}} months, unless it is ended earlier as this Agreement provides."),
  whenYes("input.auto_renew", [c1("At the end of the initial term this Agreement renews automatically for successive periods equal to the initial term, unless either party gives the other written notice of non-renewal before the term ends, or it is ended earlier as this Agreement provides.")]),
  whenNo("input.auto_renew", [c1("This Agreement does not renew automatically. Any extension must be agreed in writing before the term ends.")]),
]);

/** Intellectual property for work made for a customer: ownership passes on full payment; background IP stays with its owner. */
export function workProductIp(owner: string, maker: string): RawBlock[] {
  return [
    c1(`**Intellectual property.** Each party keeps ownership of the intellectual property it owned before this Agreement or develops independently of it ("Background IP"). ${maker} grants ${owner} a non-exclusive, perpetual, worldwide licence to use the Background IP that is incorporated in the deliverables, to the extent needed to use the deliverables.`),
    c2(`Subject to ${owner} paying all amounts due for them, the intellectual property rights in the deliverables created specifically for ${owner} under this Agreement (excluding Background IP and third-party materials) belong to ${owner}, and ${maker} assigns them to ${owner} on that payment.`),
    c2(`${maker} shall not include third-party or open-source material in the deliverables in a way that restricts ${owner}'s use of them, without telling ${owner} in writing first, and shall ensure that the deliverables do not knowingly infringe the rights of any third party.`),
  ];
}
