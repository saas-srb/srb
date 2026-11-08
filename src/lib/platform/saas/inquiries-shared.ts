/** Pure parts of the website's enquiries (no database, no email), shared by the server code and the tests. */
export type InquiryKind = "demo" | "contact" | "privacy";

/** The days we have to answer a privacy request. */
export const PRIVACY_REQUEST_DAYS = 30;
export const PRIVACY_REQUEST_TYPES = ["Get a summary of my personal data", "Correct, complete or update my data", "Erase my data", "Withdraw my consent", "Nominate someone to exercise my rights", "Make a grievance or complaint", "Something else"] as const;

export interface Inquiry {
  _id: string;
  kind: InquiryKind;
  name: string;
  email: string;
  company: string;
  phone: string;
  teamSize: string;
  interest: string;
  message: string;
  status: "new" | "contacted" | "closed";
  createdAt: Date;
  /** Privacy requests only: the reference the person is given, and the date by which we must answer. */
  reference?: string;
  dueAt?: Date;
}

export interface InquiryInput {
  kind: InquiryKind;
  name: string;
  email: string;
  company: string;
  phone: string;
  teamSize: string;
  interest: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function parseInquiry(kind: InquiryKind, fd: FormData): { ok: true; value: InquiryInput } | { ok: false; error: string; field: string } {
  const value: InquiryInput = {
    kind,
    name: clip(fd.get("name"), 120),
    email: clip(fd.get("email"), 200).toLowerCase(),
    company: clip(fd.get("company"), 160),
    phone: clip(fd.get("phone"), 40),
    teamSize: clip(fd.get("teamSize"), 40),
    interest: clip(fd.get("interest"), 120),
    message: clip(fd.get("message"), 3000),
  };
  if (value.name.length < 2) return { ok: false, error: "Please enter your name.", field: "name" };
  if (!EMAIL_RE.test(value.email)) return { ok: false, error: "Please enter a valid email address.", field: "email" };
  if (kind === "demo" && value.company.length < 2) return { ok: false, error: "Please enter your company name.", field: "company" };
  if (kind === "privacy") {
    if (!(PRIVACY_REQUEST_TYPES as readonly string[]).includes(value.interest)) return { ok: false, error: "Please choose what you would like us to do.", field: "interest" };
    if (value.message.length < 10) return { ok: false, error: "Please tell us a little more so we can find your information.", field: "message" };
  }
  if (kind === "contact" && value.message.length < 10) return { ok: false, error: "Please tell us a little more about how we can help.", field: "message" };
  return { ok: true, value };
}

