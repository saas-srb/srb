import { isValidLeadStatus, type LeadStatus } from "@/lib/lead-status";
import { campaignKeyFor, inferPlatform, normalizeUtm, type Utm } from "@/lib/utm";

export interface LeadInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  subService?: unknown;
  source?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmContent?: unknown;
  utmTerm?: unknown;
}

/** Admin-only fields accepted on updates, never on public creation. */
export interface LeadAdminInput {
  status?: unknown;
  notes?: unknown;
  dealValue?: unknown;
}

/** How a lead got attributed to its campaign. */
export interface LeadAttribution {
  method: "utm" | "csv" | "manual";
  at: Date;
}

export interface LeadRecord {
  name: string;
  email: string;
  phone: string;
  message?: string;
  subService?: string;
  source?: string;
  status?: LeadStatus;
  notes?: string;
  /** Campaign display name (as it appears in the ad platform). */
  campaign?: string;
  /** Normalized campaign identity — the join key against imported campaign data. */
  campaignKey?: string;
  utm?: Utm;
  /** Won-deal value in INR. Admin-entered; drives campaign ROI. */
  dealValue?: number;
  attribution?: LeadAttribution;
}

export const DEAL_VALUE_MAX = 1_000_000_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;

export function validateLeadInput(input: LeadInput): { valid: true; data: LeadRecord } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "Name is required.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";

  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!phone) errors.phone = "Phone number is required.";
  else if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  else if (email.length > 254) errors.email = "Email must be 254 characters or fewer.";

  let message: string | undefined;
  if (typeof input.message === "string" && input.message.trim()) {
    message = input.message.trim();
    if (message.length > 4000) errors.message = "Message must be 4000 characters or fewer.";
  }

  let subService: string | undefined;
  if (typeof input.subService === "string" && input.subService.trim()) {
    subService = input.subService.trim();
    if (subService.length > 120) errors.subService = "Invalid service selection.";
  }

  let source = typeof input.source === "string" ? input.source.trim().slice(0, 200) : undefined;

  // UTM capture: the platform-tagged landing URL params, attached by the client
  // on submit. When utm_source names a known ad platform, it wins over the
  // form-supplied `source` and utm_campaign becomes the lead's campaign.
  const utm = normalizeUtm({
    source: input.utmSource,
    medium: input.utmMedium,
    campaign: input.utmCampaign,
    content: input.utmContent,
    term: input.utmTerm,
  });

  let campaign: string | undefined;
  let campaignKey: string | undefined;
  let attribution: LeadAttribution | undefined;

  if (utm) {
    const platform = inferPlatform(utm.source, utm.medium);
    if (platform) {
      source = platform;
      if (utm.campaign) {
        campaign = utm.campaign;
        campaignKey = campaignKeyFor(utm.campaign);
        attribution = { method: "utm", at: new Date() };
      }
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { name, phone, email, message, subService, source, utm, campaign, campaignKey, attribution } };
}

export function validateLeadUpdate(input: LeadInput & LeadAdminInput): { valid: true; data: Partial<LeadRecord> } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: Partial<LeadRecord> = {};

  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) errors.name = "Name cannot be empty.";
    else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";
    else data.name = name;
  }

  if (input.phone !== undefined) {
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (!phone) errors.phone = "Phone number cannot be empty.";
    else if (!PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";
    else data.phone = phone;
  }

  if (input.email !== undefined) {
    const email = typeof input.email === "string" ? input.email.trim() : "";
    if (!email) errors.email = "Email cannot be empty.";
    else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else data.email = email;
  }

  if (input.message !== undefined) {
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (message.length > 4000) errors.message = "Message must be 4000 characters or fewer.";
    else data.message = message || undefined;
  }

  if (input.subService !== undefined) {
    const subService = typeof input.subService === "string" ? input.subService.trim() : "";
    if (subService.length > 120) errors.subService = "Invalid service selection.";
    else data.subService = subService || undefined;
  }

  if (input.status !== undefined) {
    const status = typeof input.status === "string" ? input.status.trim() : "";
    if (!isValidLeadStatus(status)) errors.status = "Invalid status.";
    else data.status = status;
  }

  if (input.notes !== undefined) {
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (notes.length > 5000) errors.notes = "Notes must be 5000 characters or fewer.";
    else data.notes = notes || undefined;
  }

  if (input.dealValue !== undefined) {
    if (input.dealValue === null || input.dealValue === "") {
      data.dealValue = undefined;
    } else {
      const n = typeof input.dealValue === "number" ? input.dealValue : Number(String(input.dealValue).replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(n) || n < 0) errors.dealValue = "Enter a valid amount.";
      else if (n > DEAL_VALUE_MAX) errors.dealValue = "Amount is too large.";
      else data.dealValue = Math.round(n * 100) / 100;
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data };
}

export const RESUME_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const RESUME_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const RESUME_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"];

export function validateResumeFile(file: File): string | null {
  if (file.size === 0) return "Resume file is empty.";
  if (file.size > RESUME_MAX_SIZE_BYTES) return "Resume must be 5MB or smaller.";

  const ext = file.name.split(".").pop()?.toLowerCase();
  const validExt = !!ext && (RESUME_ALLOWED_EXTENSIONS as string[]).includes(ext);
  const validType = RESUME_ALLOWED_MIME_TYPES.includes(file.type);

  if (!validExt && !validType) {
    return "Resume must be a PDF or Word document (.pdf, .doc, .docx).";
  }
  return null;
}
