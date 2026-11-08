/** Rules of the "reactivate my suspended workspace" request (pure: used by the form and the server). */

export const ID_MAX_BYTES = 4 * 1024 * 1024; // stays under the 4.5 MB request limit of serverless hosts
export const ID_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const ID_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 2000;
export const REASON_MIN = 10;
export const REASON_MAX = 1000;

export type RequestStatus = "pending" | "approved" | "rejected";

export interface RequestInput {
  name: string;
  email: string;
  message: string;
  consent: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** First problem with the typed fields, or null. */
export function requestInputError(i: RequestInput): string | null {
  const name = i.name.trim();
  if (name.length < 2 || name.length > 100) return "Enter your full name.";
  if (!EMAIL.test(i.email.trim()) || i.email.length > 200) return "Enter a valid email address.";
  const m = i.message.trim().length;
  if (m < MESSAGE_MIN) return `Tell us a little more: at least ${MESSAGE_MIN} characters on why the workspace should be reactivated.`;
  if (m > MESSAGE_MAX) return `Keep the description under ${MESSAGE_MAX} characters.`;
  if (!i.consent) return "Please confirm that you are authorised to act for this company.";
  return null;
}

/** The file must look like what it claims (first bytes), not just be named so. Returns the stored type or null. */
export function sniffIdType(bytes: Uint8Array): keyof typeof ID_TYPES | null {
  const at = (sig: number[], off = 0) => sig.every((b, i) => bytes[off + i] === b);
  if (bytes.length < 12) return null;
  if (at([0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}

export function fileError(f: { size: number; type: string }): string | null {
  if (f.size === 0) return "The file is empty.";
  if (f.size > ID_MAX_BYTES) return "The file is larger than 4 MB. Upload a smaller scan or photo.";
  return null;
}

/** Reject needs a reason the company can read. */
export function reasonError(reason: string): string | null {
  const n = reason.trim().length;
  if (n < REASON_MIN) return `Give a reason of at least ${REASON_MIN} characters; it is emailed to the company.`;
  if (n > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

export const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
};
