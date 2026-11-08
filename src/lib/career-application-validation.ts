import { isValidCareerApplicationStatus, type CareerApplicationStatus } from "@/lib/career-application-status";

export { RESUME_MAX_SIZE_BYTES, RESUME_ALLOWED_MIME_TYPES, RESUME_ALLOWED_EXTENSIONS, validateResumeFile } from "@/lib/lead-validation";

export interface ApplicationInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  coverNote?: unknown;
  positionSlug?: unknown;
  source?: unknown;
}

/** Admin-only fields accepted on updates, never on public creation. */
export interface ApplicationAdminInput {
  status?: unknown;
  notes?: unknown;
}

export interface ApplicationRecord {
  name: string;
  email: string;
  phone: string;
  coverNote?: string;
  positionSlug?: string;
  source?: string;
  status?: CareerApplicationStatus;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;

export function validateApplicationInput(input: ApplicationInput): { valid: true; data: ApplicationRecord } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "Name is required.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  else if (email.length > 254) errors.email = "Email must be 254 characters or fewer.";

  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!phone) errors.phone = "Phone number is required.";
  else if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";

  let coverNote: string | undefined;
  if (typeof input.coverNote === "string" && input.coverNote.trim()) {
    coverNote = input.coverNote.trim();
    if (coverNote.length > 4000) errors.coverNote = "Cover note must be 4000 characters or fewer.";
  }

  const positionSlug = typeof input.positionSlug === "string" && input.positionSlug.trim() ? input.positionSlug.trim() : undefined;

  const source = typeof input.source === "string" ? input.source.trim().slice(0, 200) : undefined;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { name, email, phone, coverNote, positionSlug, source } };
}

export function validateApplicationUpdate(input: ApplicationInput & ApplicationAdminInput): { valid: true; data: Partial<ApplicationRecord> } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: Partial<ApplicationRecord> = {};

  if (input.status !== undefined) {
    const status = typeof input.status === "string" ? input.status.trim() : "";
    if (!isValidCareerApplicationStatus(status)) errors.status = "Invalid status.";
    else data.status = status;
  }

  if (input.notes !== undefined) {
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (notes.length > 5000) errors.notes = "Notes must be 5000 characters or fewer.";
    else data.notes = notes || undefined;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data };
}
