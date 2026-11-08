/**
 * Pure (no `server-only`) form-field types shared between the server-only
 * data layer (`src/lib/sitecraft-ai/forms.ts`) and the client contact form
 * (`src/components/sections/forms/ContactSections.tsx`).
 */
export interface CmsFormFieldConfig {
  name: string;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  visible: boolean;
  orderKey: number;
}

/**
 * The contact form's fields — SYSTEM keys, not content: each is an
 * `<input name>` the leads pipeline (`/api/leads/[category]`) reads. Their
 * labels, placeholders, help text, required/visible and order are CMS content.
 */
export const CONTACT_FORM_FIELD_NAMES = ["name", "email", "phone", "message"] as const;

/** A field with no CMS config yet: present in the form, with no text. */
export const blankFormField = (name: string, i: number): CmsFormFieldConfig => ({
  name, label: "", placeholder: "", helpText: "", required: false, visible: true, orderKey: (i + 1) * 1024,
});

/** The stored config for every system field (a field missing from the CMS gets a blank config). */
export function completeFormFields(names: readonly string[], stored: CmsFormFieldConfig[]): CmsFormFieldConfig[] {
  return names.map((name, i) => stored.find((f) => f.name === name) ?? blankFormField(name, i));
}
