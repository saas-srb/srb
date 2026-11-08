import type { Audience } from "@/lib/offers/constants";

export interface ClaimContact {
  name: string;
  email?: string;
  phone: string;
}

export interface ClaimValidationResult {
  valid: true;
  contact: ClaimContact;
  audienceFields: Record<string, string | undefined>;
}

export interface ClaimValidationError {
  valid: false;
  errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;

interface RawClaimInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  // CLIENT / HIRING
  company?: unknown;
  budgetRange?: unknown;
  message?: unknown;
  // STUDENT
  college?: unknown;
  graduationYear?: unknown;
  program?: unknown;
  experienceLevel?: unknown;
  // INTERN
  skills?: unknown;
  track?: unknown;
}

function str(v: unknown, max = 300): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/**
 * Validates the claim modal's short, audience-specific field set.
 * CLIENT/HIRING: name/company/email/phone/budgetRange/message
 * STUDENT: name/email/phone/college/graduationYear/program/experienceLevel
 * INTERN: name/email/phone/college/skills/track
 */
export function validateClaimInput(audience: Audience, input: RawClaimInput): ClaimValidationResult | ClaimValidationError {
  const errors: Record<string, string> = {};

  const name = str(input.name, 120) ?? "";
  if (!name) errors.name = "Name is required.";

  const phone = str(input.phone, 30) ?? "";
  if (!phone) errors.phone = "Phone number is required.";
  else if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";

  const email = str(input.email, 254);
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  const audienceFields: Record<string, string | undefined> = {};

  if (audience === "CLIENT" || audience === "HIRING") {
    audienceFields.company = str(input.company, 160);
    audienceFields.budgetRange = str(input.budgetRange, 60);
    audienceFields.message = str(input.message, 1000);
  } else if (audience === "STUDENT") {
    audienceFields.college = str(input.college, 160);
    audienceFields.graduationYear = str(input.graduationYear, 8);
    audienceFields.program = str(input.program, 160);
    audienceFields.experienceLevel = str(input.experienceLevel, 60);
    if (!audienceFields.college) errors.college = "College/university is required.";
  } else {
    // INTERN
    audienceFields.college = str(input.college, 160);
    audienceFields.skills = str(input.skills, 300);
    audienceFields.track = str(input.track, 160);
    if (!audienceFields.college) errors.college = "College/university is required.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, contact: { name, email, phone }, audienceFields };
}

/** Turns the structured audience fields into a readable block for the shared lead's `message`. */
export function formatClaimMessage(offerTitle: string, audienceFields: Record<string, string | undefined>): string {
  const lines = Object.entries(audienceFields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${titleizeKey(k)}: ${v}`);
  return [`[Festival Offer: ${offerTitle}]`, ...lines].join("\n");
}

function titleizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
