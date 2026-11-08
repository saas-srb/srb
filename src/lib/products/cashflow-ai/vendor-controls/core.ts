/**
 * Vendor controls, the parts that need no database: how bank details are judged, the MSME payment date, and the limits on an advance.
 * Kept free of 'server-only' so the rules can be tested on their own.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => paise / 100;

/* ---------- Bank details ---------- */

export interface BankDetails {
  /** The name money is sent to: a changed name is as much a redirection as a changed account. */
  name: string | null;
  account: string | null;
  ifsc: string | null;
  upi: string | null;
}

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toUpperCase();

/** Whether two sets of payable details point at the same place (spacing and case do not matter). */
export function sameDetails(a: BankDetails, b: BankDetails): boolean {
  return clean(a.name) === clean(b.name) && clean(a.account) === clean(b.account) && clean(a.ifsc) === clean(b.ifsc) && clean(a.upi) === clean(b.upi);
}

export const last4Of = (account: string | null | undefined) => clean(account).slice(-4);

export type BankStatus =
  /** No details saved at all. */
  | "none"
  /** The saved details are the ones a person verified (or the first entry, never changed since). */
  | "verified"
  /** Details were changed and wait for a second person; any earlier verified details stay in force. */
  | "awaiting";

export function bankStatus(hasCurrent: boolean, hasVerified: boolean, currentIsVerified: boolean): BankStatus {
  if (!hasCurrent && !hasVerified) return "none";
  if (hasCurrent && hasVerified && currentIsVerified) return "verified";
  return "awaiting";
}

export const VERIFY_METHODS = [
  { value: "phone_known_number", label: "Phone call to a number we already had" },
  { value: "in_writing", label: "Written confirmation (letterhead or signed letter)" },
  { value: "in_person", label: "In person" },
] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number]["value"];

/** Why this person may not verify, or null. Checking your own change defeats the purpose of a second pair of eyes. */
export function verifierProblem(verifierId: string, changedBy: string | null | undefined): string | null {
  if (changedBy && verifierId === changedBy) return "You made this change yourself, so someone else must verify it.";
  return null;
}

export function validateVerification(input: { method: unknown; note: unknown }): { ok: true; method: VerifyMethod; note: string } | { ok: false; error: string } {
  const method = VERIFY_METHODS.find((m) => m.value === input.method)?.value;
  if (!method) return { ok: false, error: "Choose how you checked the new details with the vendor." };
  const note = String(input.note ?? "").trim();
  if (note.length < 10) return { ok: false, error: "Write a short note of who you spoke to or what you received (at least 10 characters)." };
  if (note.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  return { ok: true, method, note };
}

/* ---------- MSME ---------- */

export const MSME_CATEGORIES = ["micro", "small", "medium", "none"] as const;
export type MsmeCategory = (typeof MSME_CATEGORIES)[number];
export const MSME_LABEL: Record<MsmeCategory, string> = { micro: "Micro enterprise", small: "Small enterprise", medium: "Medium enterprise", none: "Not an MSME" };

/** Udyam registration number as issued: UDYAM-XX-00-0000000. Accepts it typed without dashes or in lower case. */
export function normalizeUdyam(raw: unknown): string | null {
  const s = String(raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  const m = /^UDYAM([A-Z]{2})(\d{2})(\d{7})$/.exec(s);
  return m ? `UDYAM-${m[1]}-${m[2]}-${m[3]}` : null;
}

export function validateMsme(input: { category: unknown; udyam: unknown }): { ok: true; category: MsmeCategory; udyam: string | null } | { ok: false; error: string } {
  const category = MSME_CATEGORIES.find((c) => c === input.category);
  if (!category) return { ok: false, error: "Choose micro, small, medium or not an MSME." };
  if (category === "none") return { ok: true, category, udyam: null };
  const udyam = normalizeUdyam(input.udyam);
  if (!udyam) return { ok: false, error: "The Udyam registration number looks like UDYAM-MH-01-1234567 (two letters, two digits, seven digits)." };
  return { ok: true, category, udyam };
}

/** The company's days for paying MSME vendors: a whole number of days, or empty for "not confirmed". */
export function parsePaymentDays(raw: unknown): { ok: true; days: number | null } | { ok: false; error: string } {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: true, days: null };
  if (!/^\d{1,3}$/.test(s)) return { ok: false, error: "Enter the number of days as a whole number, or leave it empty if it is not confirmed." };
  const days = Number(s);
  if (days < 1 || days > 365) return { ok: false, error: "Days must be from 1 to 365." };
  return { ok: true, days };
}

const DAY = 86_400_000;
function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === s ? t : null;
}

export function addDaysISO(date: string, days: number): string | null {
  const t = parseDate(date);
  return t === null ? null : new Date(t + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetweenISO(a: string, b: string): number | null {
  const x = parseDate(a);
  const y = parseDate(b);
  return x === null || y === null ? null : Math.round((y - x) / DAY);
}

export type MsmeBillState = "unconfirmed" | "overdue" | "due_soon" | "on_time";

/**
 * When an MSME vendor's bill must be paid by, counted from the bill date (the day of acceptance is not recorded). With no days confirmed
 * by the company there is no date and no judgement: the state is "unconfirmed".
 */
export function msmeBill(billDate: string, days: number | null, today: string, soonWithin = 7): { dueBy: string | null; state: MsmeBillState; daysLate: number } {
  if (days === null) return { dueBy: null, state: "unconfirmed", daysLate: 0 };
  const dueBy = addDaysISO(billDate, days);
  const left = dueBy ? daysBetweenISO(today, dueBy) : null;
  if (dueBy === null || left === null) return { dueBy: null, state: "unconfirmed", daysLate: 0 };
  if (left < 0) return { dueBy, state: "overdue", daysLate: -left };
  return { dueBy, state: left <= soonWithin ? "due_soon" : "on_time", daysLate: 0 };
}

/* ---------- Advances and deposits ---------- */

export const ADVANCE_KINDS = ["advance", "deposit"] as const;
export type AdvanceKind = (typeof ADVANCE_KINDS)[number];
export type AdvanceStatus = "open" | "adjusted" | "refunded";

export function validateAdvance(input: Record<string, unknown>, today: string): { ok: true; data: { kind: AdvanceKind; amountPaise: number; paidOn: string; purpose: string; reference: string | null } } | { ok: false; error: string } {
  const kind = ADVANCE_KINDS.find((k) => k === input.kind);
  if (!kind) return { ok: false, error: "Choose whether this is an advance or a security deposit." };
  const amount = Number(String(input.amount ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000_000) return { ok: false, error: "Enter an amount from ₹1 to ₹100 crore." };
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return { ok: false, error: "An amount can have at most two decimal places." };
  const paidOn = String(input.paidOn ?? "");
  if (parseDate(paidOn) === null) return { ok: false, error: "Enter the date it was paid." };
  if (paidOn > today) return { ok: false, error: "The date paid cannot be in the future." };
  const purpose = String(input.purpose ?? "").trim();
  if (purpose.length < 3) return { ok: false, error: "Write what it was paid for." };
  if (purpose.length > 300) return { ok: false, error: "Keep the purpose under 300 characters." };
  const reference = String(input.reference ?? "").trim().slice(0, 80) || null;
  return { ok: true, data: { kind, amountPaise: toPaise(amount), paidOn, purpose, reference } };
}

/** Why `amountPaise` cannot be adjusted against a bill, or null. All in paise so no rounding can sneak in. */
export function adjustProblem(amountPaise: number, openPaise: number, billOutstandingPaise: number): string | null {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) return "Enter an amount of at least ₹1.";
  if (amountPaise > openPaise) return `Only ₹${fromPaise(openPaise).toLocaleString("en-IN")} of this is still open.`;
  if (amountPaise > billOutstandingPaise) return `Only ₹${fromPaise(Math.max(0, billOutstandingPaise)).toLocaleString("en-IN")} is still owed on that bill.`;
  return null;
}

/** Today's date in India (UTC+5:30) as YYYY-MM-DD: a bill due "today" must not turn overdue at 6:30 in the evening. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
