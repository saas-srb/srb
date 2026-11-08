import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { CONTACT_FORM_FIELD_NAMES, completeFormFields, type CmsFormFieldConfig } from "@/lib/products/sitecraft-ai/forms-shared";

/**
 * CMS-editable form field config. Phase 1 covers exactly the contact form's
 * existing field set against the existing `useLeadSubmit` -> `/api/leads/[category]`
 * -> `src/lib/leads.ts` pipeline, which stays completely untouched — a field's
 * `name` (the actual `<input name>`/state key) is fixed and never CMS-sourced,
 * only its label/placeholder/help/required/visible/order are. There is
 * deliberately no generic form builder / submission storage in this pass —
 * see the CMS plan's open questions.
 *
 * Types live in the pure `forms-shared.ts` (no `server-only`) since
 * `ContactSections.tsx` (a client component) uses them too.
 */
export { CONTACT_FORM_FIELD_NAMES };
export type { CmsFormFieldConfig };

interface CmsFormDoc {
  _id: string;
  formKey: string;
  fields: CmsFormFieldConfig[];
  updatedAt: Date;
  updatedBy: string | null;
}

async function col() {
  const db = await getDb();
  return db.collection<CmsFormDoc>(COLLECTIONS.forms);
}

/** The form's stored field config, completed to its system field set. */
export async function getFormDoc(formKey: string, names: readonly string[]): Promise<CmsFormFieldConfig[]> {
  const c = await col();
  const doc = await c.findOne({ _id: formKey });
  return completeFormFields(names, doc?.fields ?? []);
}

export async function saveFormFields(formKey: string, fields: CmsFormFieldConfig[], actorId: string): Promise<void> {
  const c = await col();
  await c.updateOne({ _id: formKey }, { $set: { formKey, fields, ...updateStamp(actorId) } }, { upsert: true });
  expireSiteCache();
}

async function loadContactFormFields(): Promise<CmsFormFieldConfig[]> {
  return getFormDoc("contact", CONTACT_FORM_FIELD_NAMES);
}

const cachedContactForm = companyCache(loadContactFormFields, ["cms-contact-form-v1"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

export async function getContactFormFields(): Promise<CmsFormFieldConfig[]> {
  return cachedContactForm();
}
