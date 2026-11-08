import { cleanContextValue } from "@/lib/products/agentos/calls/context";
import { LEAD_SOURCE_META, type LeadManagementSource, type LeadType } from "@/lib/lead-management/types";

/**
 * What DealFlow tells the "Call with AI" button about a record. Pure (client-safe): it builds the call target, the number as stored,
 * the default purpose and a WHITELISTED context. Only the fields named here ever reach the agent, each cleaned and length-capped;
 * nothing else on the record (email, notes, documents, compensation, free text beyond a short excerpt) is passed on.
 */

export const DEALFLOW_PRODUCT = "dealflow-ai";
export type DealflowCallEntity = "lead" | "applicant" | "submission";

export interface DealflowCallSpec {
  target: { product: string; entityType: DealflowCallEntity; entityId: string; label: string };
  /** The number as stored on the record (the dialog normalises and asks the person to confirm it); "" when the record has none. */
  phone: string;
  defaultPurpose: string;
  context: Record<string, string>;
  /** Why calling isn't offered, or null. */
  unavailable: string | null;
}

export const NO_PHONE_REASON = "This record has no phone number, so it can't be called. Add a number first.";
export const DO_NOT_CONTACT_REASON = "Marked do not contact. Allow contact again to call.";

const EXCERPT_MAX = 160;
const SHORT_MAX = 120;
const hasPhone = (raw: unknown) => typeof raw === "string" && (raw.match(/\d/g)?.length ?? 0) >= 7;
const clean = (v: unknown, max = SHORT_MAX) => cleanContextValue(v, max);

function spec(target: DealflowCallSpec["target"], rawPhone: unknown, defaultPurpose: string, context: Record<string, string>, blocked: string | null = null): DealflowCallSpec {
  const phone = hasPhone(rawPhone) ? String(rawPhone).trim().slice(0, 40) : "";
  const label = clean(target.label, 120) || "Contact";
  return {
    target: { ...target, label },
    phone,
    defaultPurpose,
    context: Object.fromEntries(Object.entries({ contact_name: label, ...context }).filter(([, v]) => v)),
    unavailable: blocked ?? (phone ? null : NO_PHONE_REASON),
  };
}

/** A short, cleaned quote of what the person wrote (kept to one line, braces and angle brackets removed by the cleaner). */
export function messageExcerpt(message: unknown): string {
  const text = clean(message, EXCERPT_MAX);
  return text ? `Their message: "${text}"` : "";
}

const notesFor = (sourceLabel: string, message: unknown) => [sourceLabel ? `Source: ${clean(sourceLabel, 60)}.` : "", messageExcerpt(message)].filter(Boolean).join(" ").slice(0, 300);

export interface LeadCallInput {
  _id: string;
  name: string;
  phone: string;
  type: LeadType;
  source: LeadManagementSource | string;
  status: "open" | "won" | "lost" | string;
  subService?: string | null;
  message?: string | null;
  clientId?: string | null;
  doNotContact?: boolean;
  /** Used when `source` is not a Lead Management source (pipeline cards). */
  sourceText?: string;
}

/** Lead Management records (website enquiries, interns, trainees, job applicants, clients). */
export function leadCallSpec(l: LeadCallInput): DealflowCallSpec {
  const sourceLabel = (LEAD_SOURCE_META as Record<string, { label: string }>)[l.source]?.label ?? l.sourceText ?? "";
  const topic = clean(l.subService) || clean(sourceLabel);
  const existingClient = l.type === "client" && (l.status === "won" || Boolean(l.clientId));
  const purpose = l.type === "job_applicant" || l.type === "intern" ? "screening" : existingClient ? "client_followup" : "lead_followup";
  return spec(
    { product: DEALFLOW_PRODUCT, entityType: "lead", entityId: String(l._id), label: l.name },
    l.phone, purpose,
    { role_title: clean(l.subService) || clean(sourceLabel), enquiry_topic: topic, project_name: topic, notes: notesFor(sourceLabel, l.message) },
    l.doNotContact ? DO_NOT_CONTACT_REASON : null,
  );
}

/** A career application (the applicants list and profile). Passes the name and the role only. */
export function applicantCallSpec(a: { _id: string; name: string; phone: string; positionTitle?: string | null }): DealflowCallSpec {
  const role = clean(a.positionTitle);
  return spec({ product: DEALFLOW_PRODUCT, entityType: "applicant", entityId: String(a._id), label: a.name }, a.phone, "screening", { role_title: role });
}

/** A website form submission (software, marketing, AI, training enquiries). The id carries the category, which the page needs. */
export const submissionEntityId = (category: string, id: string) => `${category}:${id}`;
export function parseSubmissionEntityId(entityId: string): { category: string; id: string } | null {
  const i = entityId.indexOf(":");
  if (i <= 0 || i === entityId.length - 1) return null;
  return { category: entityId.slice(0, i), id: entityId.slice(i + 1) };
}
export function submissionCallSpec(s: { id: string; category: string; name: string; phone: string; subService?: string | null; message?: string | null; categoryLabel?: string }): DealflowCallSpec {
  const topic = clean(s.subService) || clean(s.categoryLabel);
  return spec(
    { product: DEALFLOW_PRODUCT, entityType: "submission", entityId: submissionEntityId(s.category, s.id), label: s.name },
    s.phone, "lead_followup",
    { enquiry_topic: topic, project_name: topic, notes: notesFor(s.categoryLabel ?? "", s.message) },
  );
}

/** The button for a card in the pipeline views (jobs / interns / trainees / clients), whichever kind of record the card is. */
export function pipelineCallSpec(c: { id: string; pipeline: "jobs" | "interns" | "trainees" | "clients"; callEntity?: DealflowCallEntity; submissionCategory?: string; name: string; phone: string; titleOrService: string; message?: string; sourceLabel: string; doNotContact?: boolean }): DealflowCallSpec | null {
  if (c.callEntity === "applicant") return applicantCallSpec({ _id: c.id, name: c.name, phone: c.phone, positionTitle: c.titleOrService });
  if (c.callEntity === "submission" && c.submissionCategory) return submissionCallSpec({ id: c.id, category: c.submissionCategory, name: c.name, phone: c.phone, subService: c.titleOrService, message: c.message, categoryLabel: c.sourceLabel });
  if (c.callEntity === "lead") {
    const type: LeadType = c.pipeline === "jobs" ? "job_applicant" : c.pipeline === "interns" ? "intern" : c.pipeline === "trainees" ? "trainee" : "client";
    return leadCallSpec({ _id: c.id, name: c.name, phone: c.phone, type, source: "", status: "open", subService: c.titleOrService, message: c.message, doNotContact: c.doNotContact, sourceText: c.sourceLabel });
  }
  return null;
}
