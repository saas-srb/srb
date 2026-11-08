/** Client-safe document constants (no I/O). */

export const DOCUMENT_CATEGORIES = [
  { value: "resume", label: "Resume / CV" },
  { value: "aadhaar", label: "Aadhaar" },
  { value: "pan", label: "PAN" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "appointment_letter", label: "Appointment Letter" },
  { value: "experience_letter", label: "Experience Letter" },
  { value: "relieving_letter", label: "Relieving Letter" },
  { value: "certificate", label: "Certificate" },
  { value: "address_proof", label: "Address Proof" },
  { value: "bank_proof", label: "Bank Proof" },
  { value: "other", label: "Other" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];

export function isValidDocumentCategory(v: string): v is DocumentCategory {
  return DOCUMENT_CATEGORIES.some((c) => c.value === v);
}

export function documentCategoryLabel(v: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

/** Categories an employee may upload for themselves via the portal. */
export const EMPLOYEE_UPLOADABLE_CATEGORIES: DocumentCategory[] = ["certificate", "address_proof", "bank_proof", "other"];

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOCUMENT_ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "doc", "docx"];
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Mirrors `validateResumeFile` in `src/lib/lead-validation.ts`. */
export function validateDocumentFile(file: File): string | null {
  if (file.size === 0) return "The file is empty.";
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) return "File must be 10MB or smaller.";
  const ext = file.name.split(".").pop()?.toLowerCase();
  const validExt = !!ext && DOCUMENT_ALLOWED_EXTENSIONS.includes(ext);
  const validType = DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type);
  if (!validExt && !validType) return "Upload a PDF, image (JPG/PNG) or Word document.";
  return null;
}

/** Content types safe to render inline in the browser. */
export function isInlinePreviewable(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}
