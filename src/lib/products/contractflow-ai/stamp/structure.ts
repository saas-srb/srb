/**
 * Stamp rulebook: the STRUCTURE only (client-safe, pure). Which jurisdictions and instrument categories exist, what an entry looks like, and
 * how an entry is checked. There is not one duty amount in this file: amounts are law, they are typed in the Console by a platform
 * administrator from the state's Stamp Act and notifications, and each entry stays UNCONFIRMED until a reviewer confirms it.
 */

export interface Jurisdiction {
  /** ISO 3166-2:IN subdivision code without the "IN-" prefix. */
  code: string;
  name: string;
  kind: "state" | "ut";
}

/** 28 states and 8 union territories (Dadra and Nagar Haveli and Daman and Diu are one UT since 2020). Names and codes only. */
export const JURISDICTIONS: readonly Jurisdiction[] = [
  { code: "AP", name: "Andhra Pradesh", kind: "state" },
  { code: "AR", name: "Arunachal Pradesh", kind: "state" },
  { code: "AS", name: "Assam", kind: "state" },
  { code: "BR", name: "Bihar", kind: "state" },
  { code: "CG", name: "Chhattisgarh", kind: "state" },
  { code: "GA", name: "Goa", kind: "state" },
  { code: "GJ", name: "Gujarat", kind: "state" },
  { code: "HR", name: "Haryana", kind: "state" },
  { code: "HP", name: "Himachal Pradesh", kind: "state" },
  { code: "JH", name: "Jharkhand", kind: "state" },
  { code: "KA", name: "Karnataka", kind: "state" },
  { code: "KL", name: "Kerala", kind: "state" },
  { code: "MP", name: "Madhya Pradesh", kind: "state" },
  { code: "MH", name: "Maharashtra", kind: "state" },
  { code: "MN", name: "Manipur", kind: "state" },
  { code: "ML", name: "Meghalaya", kind: "state" },
  { code: "MZ", name: "Mizoram", kind: "state" },
  { code: "NL", name: "Nagaland", kind: "state" },
  { code: "OD", name: "Odisha", kind: "state" },
  { code: "PB", name: "Punjab", kind: "state" },
  { code: "RJ", name: "Rajasthan", kind: "state" },
  { code: "SK", name: "Sikkim", kind: "state" },
  { code: "TN", name: "Tamil Nadu", kind: "state" },
  { code: "TS", name: "Telangana", kind: "state" },
  { code: "TR", name: "Tripura", kind: "state" },
  { code: "UP", name: "Uttar Pradesh", kind: "state" },
  { code: "UK", name: "Uttarakhand", kind: "state" },
  { code: "WB", name: "West Bengal", kind: "state" },
  { code: "AN", name: "Andaman and Nicobar Islands", kind: "ut" },
  { code: "CH", name: "Chandigarh", kind: "ut" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "ut" },
  { code: "DL", name: "Delhi", kind: "ut" },
  { code: "JK", name: "Jammu and Kashmir", kind: "ut" },
  { code: "LA", name: "Ladakh", kind: "ut" },
  { code: "LD", name: "Lakshadweep", kind: "ut" },
  { code: "PY", name: "Puducherry", kind: "ut" },
];

export const jurisdictionByCode = (code: string): Jurisdiction | undefined => JURISDICTIONS.find((j) => j.code === code);

export interface InstrumentCategory {
  key: string;
  label: string;
}

/** Starter instrument categories. Names only: what each costs in each state is for the rulebook entries to say. */
export const INSTRUMENT_CATEGORIES: readonly InstrumentCategory[] = [
  { key: "agreement", label: "Agreement (general)" },
  { key: "service_agreement", label: "Service or consultancy agreement" },
  { key: "nda", label: "Non-disclosure agreement" },
  { key: "mou", label: "Memorandum of understanding" },
  { key: "employment", label: "Employment or appointment contract" },
  { key: "lease", label: "Lease or rent agreement" },
  { key: "indemnity", label: "Indemnity or indemnity bond" },
  { key: "guarantee", label: "Guarantee" },
  { key: "loan", label: "Loan agreement" },
  { key: "power_of_attorney", label: "Power of attorney" },
  { key: "affidavit", label: "Affidavit" },
  { key: "partnership_deed", label: "Partnership deed" },
  { key: "sale_of_goods", label: "Sale of goods agreement" },
  { key: "other", label: "Other instrument" },
];

export const categoryLabel = (key: string): string => INSTRUMENT_CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const DUTY_TYPES = ["not_entered", "fixed", "ad_valorem", "exempt"] as const;
export type DutyType = (typeof DUTY_TYPES)[number];
export const DUTY_TYPE_LABEL: Record<DutyType, string> = { not_entered: "Not entered", fixed: "Fixed amount", ad_valorem: "Percentage of value (ad valorem)", exempt: "Exempt" };

export const ESTAMP_VALUES = ["unknown", "shcil", "state", "none"] as const;
export type EStampAvailability = (typeof ESTAMP_VALUES)[number];
export const ESTAMP_LABEL: Record<EStampAvailability, string> = { unknown: "Not entered", shcil: "SHCIL e-stamping", state: "State's own system", none: "No e-stamping" };

/** The part of an entry a reviewer confirms. Changing any of it removes the confirmation. */
export interface StampEntryContent {
  category: string;
  title: string;
  dutyType: DutyType;
  /** Rupees. Null = not entered. */
  fixedAmount: number | null;
  /** Percent of the stated value. Null = not entered. */
  ratePercent: number | null;
  /** Words describing what the rate applies to, exactly as the Act puts it (for example the unit of value). Free text. */
  rateBasis: string;
  minAmount: number | null;
  capAmount: number | null;
  exemptions: string;
  notes: string;
  sourceUrl: string;
  sourceTitle: string;
  /** ISO date YYYY-MM-DD from which this entry applies. Null = not entered. */
  effectiveFrom: string | null;
  eStamp: EStampAvailability;
}

export interface StampConfirmation {
  by: string;
  on: string;
  /** The content exactly as confirmed; the entry counts as confirmed only while its content still equals this. */
  snapshot: string;
}

export interface StampEntry extends StampEntryContent {
  id: string;
  confirmation: StampConfirmation | null;
  updatedBy: string;
  updatedAt: string;
}

export const blankContent = (category: string): StampEntryContent => ({
  category,
  title: "",
  dutyType: "not_entered",
  fixedAmount: null,
  ratePercent: null,
  rateBasis: "",
  minAmount: null,
  capAmount: null,
  exemptions: "",
  notes: "",
  sourceUrl: "",
  sourceTitle: "",
  effectiveFrom: null,
  eStamp: "unknown",
});

const KEYS: (keyof StampEntryContent)[] = ["category", "title", "dutyType", "fixedAmount", "ratePercent", "rateBasis", "minAmount", "capAmount", "exemptions", "notes", "sourceUrl", "sourceTitle", "effectiveFrom", "eStamp"];

export function contentOf(e: StampEntryContent): StampEntryContent {
  const out = {} as Record<string, unknown>;
  for (const k of KEYS) out[k] = e[k];
  return out as unknown as StampEntryContent;
}

/** Stable text form of the content, used to tell whether an entry changed after it was confirmed. */
export function snapshotOf(e: StampEntryContent): string {
  return JSON.stringify(KEYS.map((k) => e[k] ?? null));
}

export type EntryStatus = "unconfirmed" | "confirmed";

/** Confirmed only while a confirmation exists AND the content is exactly what was confirmed. */
export function entryStatus(e: Pick<StampEntry, keyof StampEntryContent | "confirmation">): EntryStatus {
  return e.confirmation && e.confirmation.by && e.confirmation.on && e.confirmation.snapshot === snapshotOf(e) ? "confirmed" : "unconfirmed";
}

const money = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e12 && Math.round(v * 100) === v * 100);
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const isHttpsUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname.includes(".");
  } catch {
    return false;
  }
};

/** Errors that stop an entry being SAVED (even as a draft). Empty amounts are allowed: they show as "not entered". */
export function validateDraft(e: StampEntryContent): string[] {
  const errs: string[] = [];
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(e.category)) errs.push("The instrument category is not valid.");
  if (e.title.length > 200) errs.push("The title is too long (200 characters at most).");
  if (!(DUTY_TYPES as readonly string[]).includes(e.dutyType)) errs.push("The duty type is not valid.");
  if (!(ESTAMP_VALUES as readonly string[]).includes(e.eStamp)) errs.push("The e-stamp availability is not valid.");
  if (!money(e.fixedAmount)) errs.push("The fixed amount must be a number of rupees, zero or more, with at most two decimals.");
  if (!money(e.minAmount)) errs.push("The minimum must be a number of rupees, zero or more.");
  if (!money(e.capAmount)) errs.push("The cap must be a number of rupees, zero or more.");
  if (e.ratePercent !== null && !(typeof e.ratePercent === "number" && Number.isFinite(e.ratePercent) && e.ratePercent >= 0 && e.ratePercent <= 100)) errs.push("The rate must be a percentage between 0 and 100.");
  if (e.minAmount !== null && e.capAmount !== null && e.minAmount > e.capAmount) errs.push("The minimum cannot be above the cap.");
  for (const [k, v, n] of [["rateBasis", e.rateBasis, 300], ["exemptions", e.exemptions, 4000], ["notes", e.notes, 4000], ["sourceTitle", e.sourceTitle, 300], ["sourceUrl", e.sourceUrl, 500]] as const) if (v.length > n) errs.push(`${k} is too long.`);
  if (e.sourceUrl && !isHttpsUrl(e.sourceUrl)) errs.push("The source link must be a full https:// address.");
  if (e.effectiveFrom !== null && !isoDate(e.effectiveFrom)) errs.push("The effective-from date must be a real date.");
  return errs;
}

/** Extra errors that stop an entry being CONFIRMED: a reviewer cannot confirm a blank or unsourced entry. */
export function validateForConfirm(e: StampEntryContent): string[] {
  const errs = validateDraft(e);
  if (e.dutyType === "not_entered") errs.push("Choose the duty type before confirming.");
  if (e.dutyType === "fixed" && e.fixedAmount === null) errs.push("A fixed-duty entry needs its amount.");
  if (e.dutyType === "ad_valorem" && e.ratePercent === null) errs.push("A percentage entry needs its rate.");
  if (!e.sourceUrl) errs.push("Name the source (a link to the Act or notification) before confirming.");
  if (e.effectiveFrom === null) errs.push("Enter the date from which the entry applies before confirming.");
  return errs;
}

/** The sentence that must accompany every duty figure shown anywhere. */
export const STAMP_DISCLAIMER = "Stamp duty is state law and changes by notification. These figures are guidance entered by the platform and are not authoritative; confirm the requirement and the amount with a lawyer or the state's stamp office. E-signing does not replace stamping.";
