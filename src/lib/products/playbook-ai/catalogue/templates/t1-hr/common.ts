/** Shared inputs and blocks for the HR lifecycle templates (batch T1). Wording here is reused, so change it with care. */
import { c1, c2, callout, f, p, sig, spacer } from "@/lib/products/playbook-ai/catalogue/build";
import type { InputField, RawBlock } from "@/lib/products/playbook-ai/catalogue/types";

export const employeeInput = (help = "Pick the employee from the people records. Name, code, designation and department fill automatically."): InputField =>
  f.person("employee", "Employee", "employee", { help });
export const candidateInput = (): InputField => f.person("candidate", "Candidate", "candidate", { help: "Pick the candidate from the recruitment records." });

/** Date, reference and addressee for a letter to an employee. */
export function employeeLetterHead(subject: string): RawBlock[] {
  return [
    p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
    p("To,\n**{{employee.name}}**\nEmployee code: {{employee.code}}\nDesignation: {{employee.designation}}\nDepartment: {{employee.department}}"),
    p(`**Subject: ${subject}**`),
    p("Dear {{employee.first_name}},"),
  ];
}

export function candidateLetterHead(subject: string): RawBlock[] {
  return [
    p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
    p("To,\n**{{candidate.name}}**\nEmail: {{candidate.email}}"),
    p(`**Subject: ${subject}**`),
    p("Dear {{candidate.name}},"),
  ];
}

/** Closing for a letter that is NOT signed through ContractFlow: a typed sign-off. */
export function typedSignOff(): RawBlock[] {
  return [
    p("Yours sincerely,"),
    p("For **{{company.legal_name}}**"),
    spacer(10),
    p("**{{company.signatory_name}}**\n{{company.signatory_designation}}"),
  ];
}

/** Closing for a letter sent for e-signature: company signatory block. */
export function companySignOff(): RawBlock[] {
  return [p("Yours sincerely,"), p("For **{{company.legal_name}}**"), spacer(6), sig("Authorised signatory", "company_signatory")];
}

/** "Received and acknowledged" block signed by the employee or candidate. */
export function acknowledgement(text: string, label = "Employee"): RawBlock[] {
  return [p(text), spacer(6), sig(label, "counterparty", { designation: false })];
}

export const confidentialNote = (): RawBlock => callout("info", "This letter is confidential and is meant only for the person named above.");

/** Standard clause set reused by appointment and internship letters. Fixed wording, no figures. */
export function confidentialityClauses(party: string): RawBlock[] {
  return [
    c1("**Confidentiality**"),
    c2(`${party} shall keep confidential, during the engagement and after it ends, all non-public information of the Company and its clients, including business plans, client and vendor details, pricing, source code, designs, processes, financial information and personnel information, and shall use it only for the Company's work.`),
    c2(`${party} shall not copy, remove or share such information except as the Company's work requires or as the law demands, and shall return or delete it when asked and on leaving.`),
  ];
}

export function ipClauses(party: string): RawBlock[] {
  return [
    c1("**Work product and intellectual property**"),
    c2(`All work, inventions, designs, software, documents and other material created by ${party} in the course of the engagement, or using the Company's time, systems or information, belong to the Company, and ${party} shall sign any document reasonably needed to confirm this.`),
  ];
}

export const NEVER_NAMES = "any person, designation, date, amount, number or place that is not in the provided facts";
