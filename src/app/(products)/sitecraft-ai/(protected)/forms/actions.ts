"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { saveLeadCategories, DEFAULT_LEAD_CATEGORY, type LeadCategoryConfig } from "@/lib/lead-categories";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getFormDoc, saveFormFields, CONTACT_FORM_FIELD_NAMES, type CmsFormFieldConfig } from "@/lib/products/sitecraft-ai/forms";

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

export async function getContactFormFieldsAction(): Promise<CmsFormFieldConfig[]> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return getFormDoc("contact", CONTACT_FORM_FIELD_NAMES);
}

export async function saveContactFormFieldsAction(fields: CmsFormFieldConfig[]): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "FORMS_MANAGE")) return { ok: false, error: NO_PERMISSION };
  await saveFormFields("contact", fields, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "form", entityId: "contact", entityLabel: "Contact form" });
  return { ok: true };
}

export async function saveLeadCategoriesAction(categories: LeadCategoryConfig[]): Promise<Result<{ categories: LeadCategoryConfig[] }>> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "FORMS_MANAGE")) return { ok: false, error: NO_PERMISSION };
  if (await isPlatformOwnerContext()) return { ok: false, error: "This company's enquiry services are built in." };
  const saved = await saveLeadCategories(categories);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "form", entityId: "lead-categories", entityLabel: "Enquiry services" });
  return { ok: true, categories: saved.length ? saved : [DEFAULT_LEAD_CATEGORY] };
}
