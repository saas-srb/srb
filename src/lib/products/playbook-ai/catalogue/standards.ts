/**
 * Content standards for the library (pure). Each document type belongs to a CLASS that fixes the minimum default content an industry-standard
 * document of that kind has: a word count (counted on the default text with variables counted as one word) and the sections it must contain
 * (each a pattern that must match a section title or the section's first words). `scripts/audit-pb-library.ts` enforces them and writes
 * `docs/library-content-checklist.md` from them, one row per item. Overrides (`OVERRIDES`) add type-specific sections, for example an NDA's
 * exclusions and return of information.
 */
export type DocClass = "contract" | "policy" | "report" | "letter" | "form";

export interface ClassStandard { minWords: number; required: { name: string; re: RegExp }[]; needsTable?: boolean }

const R = (name: string, re: RegExp) => ({ name, re });

export const CLASS_STANDARDS: Record<DocClass, ClassStandard> = {
  contract: { minWords: 600, required: [R("parties or definitions", /part(y|ies)|definit|interpret|background|recital|reference/i), R("scope, subject or purpose", /scope|services|subject|purpose|engagement|deliverable|grant|licen|supply|work|appointment|intent|changes|new term|terms/i), R("term or duration", /term|terminat|duration|period|expiry|timeline|validity/i), R("governing law, disputes or general", /governing|law|jurisdiction|dispute|arbitrat|general|misc|effect/i), R("execution or signature", /execut|signature|sign|witness/i)] },
  policy: { minWords: 330, required: [R("purpose and scope", /purpose|scope|policy|applies|overview/i), R("rules or requirements", /rule|requirement|control|standard|principle|conduct|use|procedure|handling|access|entitlement|types|hours|remote|data|lawful|fees|claims|retention|cookie|password|device|visitor|safety|security|leave|attendance|referral|delegat|response|recovery|backup|classification|change|asset|vendor|sdlc/i), R("compliance, review or contact", /violation|breach|consequence|compliance|review|general|contact|owner|misc|acknowledg|exception|grievance|rights|queries|enforce/i)] },
  report: { minWords: 200, required: [R("summary, purpose or overview", /summary|purpose|overview|background|scope|about|context|objective|introduction|reference|details|request|incident|headline|policy|statement|challenge|charter|problem|goals|agenda|situation|requirement|plan|calendar|key figures|highlights|matrix|assessment|method|session|procedure|lesson|structure|record|aims|requirement|content|specification/i), R("detail or content", /.*/), R("actions, next steps or decision", /action|next|step|decision|recommend|resolution|approval|follow|owner|outcome|result|close|review|contact|terms|sign|schedule|checks|escalat|conclusion|notes|handover|measure|mitigation|criteria|use|rollback|support|assumption|submission|acceptance|validity|budget|reporting|summary/i)] },
  letter: { minWords: 130, required: [R("addressee and subject", /letter|certificate|notice|offer|reference|date|to,|subject|salutation|invitation|statement|order|confirmation|acknowledg|request|reminder/i), R("body", /.*/)] },
  form: { minWords: 85, required: [R("details", /.*/)] },
};

const CONTRACT_IDS = /^(ct\.|vn\.sla$|vn\.work_order$|ps\.loi$)/;
const POLICY_IDS = /(policy|handbook|code_of_conduct|^lg\.(aup|privacy|terms|cookie|dpa|dpdp_notice|retention)|byod|password|^it\.(access|sdlc|change_mgmt|data_classification|backup_dr|incident_response|vendor_security)|^op\.(bcp|quality_manual|visitor)|^mg\.doa|^hr\.(posh|grievance|referral)|^fn\.(petty_cash|travel_policy|expense_policy)|^op\.hse)/;
const LETTER_IDS = /^hr\.(offer_regret|welcome|probation_ext|confirmation|increment|promotion|transfer|role_change|bonus|appreciation|show_cause|warning|suspension|notice_waiver|experience|relieving|salary_cert|verification|resignation_accept|termination|interview_invite|internship_offer|offer|appointment)$|^lg\.(legal_notice|refund|declaration|affidavit)$|^vn\.(rejection|award)$|^ps\.followup$|^fn\.payment_reminder$/;
const FORM_IDS = /^(hr\.(mrf|interview_scorecard|ack_form|bgv_consent|exit_checklist|onboarding_checklist|asset_issue|induction_plan|probation_plan)|fn\.(receipt|credit_note|proforma|invoice_tpl|reimbursement|advance_request|petty_cash)|tr\.(attendance|certificate|feedback|assessment)|op\.(checklist|escalation|work_instruction|handover)|mg\.(agenda|raci|org_chart|risk_register|okr)|mk\.(flyer|one_pager|content_calendar)|vn\.(po|rfq|evaluation))$/;

export function classOf(id: string): DocClass {
  if (CONTRACT_IDS.test(id)) return "contract";
  if (LETTER_IDS.test(id)) return "letter";
  if (FORM_IDS.test(id)) return "form";
  if (POLICY_IDS.test(id)) return "policy";
  return "report";
}

/** Type-specific sections an industry-standard version must have, in addition to its class. */
export const OVERRIDES: Record<string, { name: string; re: RegExp }[]> = {
  "hr.offer": [R("position and joining", /position|joining|offer|role|designation/i), R("compensation", /compensation|ctc|salary|remuneration/i), R("probation and notice", /probation|notice/i), R("conditions of offer", /condition|documents|background|verification/i), R("acceptance", /accept/i)],
  "hr.appointment": [R("compensation", /compensation|ctc|salary|remuneration/i), R("probation", /probation/i), R("notice and termination", /notice|terminat/i), R("confidentiality", /confidential/i), R("working hours or leave", /hours|leave|attendance/i)],
  "ct.nda_mutual": [R("definition of confidential information", /definition|confidential information/i), R("exclusions", /exclusion|exception|not include/i), R("obligations", /obligation|duty|use and protect|protect/i), R("return or destruction", /return|destruction|destroy/i), R("remedies", /remed|injunct|breach/i)],
  "ct.nda_one_way": [R("definition of confidential information", /definition|confidential information/i), R("exclusions", /exclusion|exception|not include/i), R("obligations", /obligation|duty|use and protect|protect/i), R("return or destruction", /return|destruction|destroy/i), R("remedies", /remed|injunct|breach/i)],
  "ct.msa": [R("payment", /fee|payment|invoice/i), R("intellectual property", /intellectual|ownership/i), R("confidentiality", /confidential/i), R("liability", /liabilit|indemn/i), R("termination", /terminat/i)],
  "ct.employment": [R("compensation", /compensation|remuneration|salary/i), R("termination", /terminat|notice/i), R("confidentiality", /confidential/i)],
  "ct.lease": [R("rent and deposit", /rent|deposit/i), R("use of premises", /use of|premises|permitted use/i), R("maintenance or repairs", /maintenance|repair/i)],
  "op.sop": [R("responsibilities", /responsib|roles/i), R("steps", /step|procedure/i), R("exceptions", /exception/i)],
  "mg.status_report": [R("progress", /progress|accomplish|done/i), R("risks or issues", /risk|issue/i), R("next steps", /next/i)],
  "mg.minutes": [R("attendees", /attend|present/i), R("decisions", /decision/i), R("actions", /action/i)],
  "mg.project_charter": [R("objectives", /objective/i), R("scope", /scope/i), R("stakeholders", /stakeholder/i), R("risks", /risk/i), R("approval", /approv|sign/i)],
  "it.security_policy": [R("roles", /role|responsib/i), R("controls", /control/i), R("incident reporting", /incident|report|violation/i)],
  "hr.leave_policy": [R("types of leave", /types/i), R("applying for leave", /appl/i), R("accrual", /accru/i)],
  "lg.privacy": [R("data collected", /collect|information we/i), R("purpose of use", /use|purpose/i), R("rights", /right/i), R("contact or grievance", /contact|grievance/i)],
};

/** Short-form instruments and one-page marketing pieces (an amendment, a renewal, a termination notice, a letter of intent) are complete at a lower word count than a full agreement. */
const MIN_OVERRIDE: Record<string, number> = { "ct.amendment": 400, "ct.renewal": 420, "ct.termination": 500, "ps.loi": 450, "ct.sow": 520, "mk.flyer": 55, "mk.one_pager": 70, "mk.profile": 95, "mk.product_brochure": 110, "mk.datasheet": 120, "mk.press_release": 125 };

export const standardFor = (id: string): { cls: DocClass; minWords: number; required: { name: string; re: RegExp }[]; needsTable: boolean } => {
  const cls = classOf(id);
  const s = CLASS_STANDARDS[cls];
  return { cls, minWords: MIN_OVERRIDE[id] ?? s.minWords, required: [...s.required, ...(OVERRIDES[id] ?? [])], needsTable: !!s.needsTable };
};
