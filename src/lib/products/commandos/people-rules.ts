import type { AccessMap } from "@/lib/access/types";

/**
 * People & Access rules that need no database: the details a person is created with, the seat check, the Director lock.
 * The save itself (`people.ts`) calls these first, so the same checks run on the screen, in the action and in the tests.
 */

export const USER_TYPES = ["employee", "contractor", "partner", "system"] as const;
export type UserType = (typeof USER_TYPES)[number];

export interface PersonDetails {
  name: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD or empty. */
  joiningDate: string;
  userType: UserType;
  /** Several are allowed. The first designation is the person's main title. */
  departmentIds: string[];
  teamIds: string[];
  designationIds: string[];
  /** How the person gets in: a temporary password shown once, or an email invitation they accept. */
  invite: "password" | "email";
}

export interface PersonDraft extends PersonDetails {
  /** The features the Director picked (real features only) plus identity gates carried from the older roles. */
  access: AccessMap;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emptyDetails(): PersonDetails {
  return { name: "", email: "", phone: "", joiningDate: "", userType: "employee", departmentIds: [], teamIds: [], designationIds: [], invite: "password" };
}

const uniq = (a: unknown): string[] => (Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))].slice(0, 20) : []);

/** Cleans untrusted input into a PersonDetails (never throws). */
export function cleanDetails(raw: Partial<PersonDetails> | null | undefined): PersonDetails {
  const r = raw ?? {};
  return {
    name: typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "",
    email: typeof r.email === "string" ? r.email.trim().toLowerCase() : "",
    phone: typeof r.phone === "string" ? r.phone.trim() : "",
    joiningDate: typeof r.joiningDate === "string" ? r.joiningDate.trim() : "",
    userType: (USER_TYPES as readonly string[]).includes(r.userType as string) ? (r.userType as UserType) : "employee",
    departmentIds: uniq(r.departmentIds),
    teamIds: uniq(r.teamIds),
    designationIds: uniq(r.designationIds),
    invite: r.invite === "email" ? "email" : "password",
  };
}

export interface DetailErrors { [field: string]: string }

/** Field-by-field problems with the details, empty when fine. `isDirector` relaxes the designation rule (the company's top role has none to pick). */
export function validateDetails(d: PersonDetails, opts: { isDirector?: boolean; existingEmail?: boolean } = {}): DetailErrors {
  const e: DetailErrors = {};
  if (d.name.length < 2 || d.name.length > 80 || /[<>]/.test(d.name)) e.name = "Enter the person's full name (2 to 80 characters).";
  if (!EMAIL_RE.test(d.email)) e.email = "Enter a valid work email address.";
  if (opts.existingEmail) e.email = "An account with this email already exists.";
  if (d.phone && !/^\+?[0-9 ()-]{7,20}$/.test(d.phone)) e.phone = "Enter a phone number with 7 to 15 digits (a leading + is fine).";
  if (d.joiningDate && (!/^\d{4}-\d{2}-\d{2}$/.test(d.joiningDate) || Number.isNaN(Date.parse(d.joiningDate)))) e.joiningDate = "Choose a valid joining date.";
  if (!opts.isDirector && d.designationIds.length === 0) e.designationIds = "Choose at least one designation: the first one is the person's main title.";
  return e;
}

/** Plain verdict for the seat check shown in the Preview and enforced on save. */
export interface SeatVerdict {
  ok: boolean;
  used: number;
  limit: number | null;
  /** After this person is added. */
  after: number;
  message: string;
}

export function seatVerdict(input: { used: number; limit: number | null; takesSeat: boolean; alreadyHoldsSeat?: boolean }): SeatVerdict {
  const adding = input.takesSeat && !input.alreadyHoldsSeat ? 1 : 0;
  const after = input.used + adding;
  if (input.limit === null) return { ok: true, used: input.used, limit: null, after, message: adding ? `Uses one seat (${after} in use, no limit on your plan).` : "Uses no extra seat." };
  if (after <= input.limit) return { ok: true, used: input.used, limit: input.limit, after, message: adding ? `Uses one seat: ${after} of ${input.limit} in use after this.` : `No extra seat needed (${input.used} of ${input.limit} in use).` };
  return { ok: false, used: input.used, limit: input.limit, after, message: `Your plan includes ${input.limit} user${input.limit === 1 ? "" : "s"} and ${input.used} ${input.used === 1 ? "is" : "are"} in use. Upgrade your plan or free a seat first.` };
}

/** A Director's access can never be reduced or changed through this screen. Returns the reason or null. */
export function directorLockReason(target: { isDirector: boolean }, changesAccess: boolean): string | null {
  return target.isDirector && changesAccess ? "A Director always has full access and cannot be changed here." : null;
}

/** At least one product beyond the Workspace must be given, otherwise the person can sign in but reach nothing. */
export function hasAnyProduct(access: AccessMap, workspaceProduct = "commandos"): boolean {
  return Object.entries(access).some(([p, m]) => p !== workspaceProduct && Object.keys(m).length > 0);
}
