import { isValidAudience, type Audience } from "@/lib/offers/constants";

/** Client-safe: shared by the Notify-Me form and the API route. */
export const SUBSCRIPTION_SOURCES = ["coming_soon", "future", "none", "active"] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

export interface SubscriptionInput {
  email: string;
  name?: string;
  phone: string;
  interest?: Audience | null;
  message?: string;
  /** null = "tell me about any upcoming campaign". */
  campaignId: string | null;
  source: SubscriptionSource;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSubscription(raw: Record<string, unknown>): { valid: true; data: SubscriptionInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 200) errors.email = "Enter a valid email address.";

  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) || undefined : undefined;
  const phoneRaw = typeof raw.phone === "string" ? raw.phone.trim() : "";
  if (!phoneRaw) errors.phone = "Phone number is required.";
  else if (!/^[+()\d\s-]{7,20}$/.test(phoneRaw)) errors.phone = "Enter a valid phone number.";
  const message = typeof raw.message === "string" ? raw.message.trim().slice(0, 600) || undefined : undefined;
  const interest = isValidAudience(raw.interest) ? raw.interest : null;
  const source = SUBSCRIPTION_SOURCES.includes(raw.source as SubscriptionSource) ? (raw.source as SubscriptionSource) : "none";
  const campaignId = typeof raw.campaignId === "string" && raw.campaignId ? raw.campaignId.slice(0, 100) : null;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { email, name, phone: phoneRaw, interest, message, campaignId, source } };
}
