import "server-only";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { normalizeRoles } from "@/lib/hrms-roles";
import { createHrmsSession, setHrmsSessionCookie, clearHrmsSessionCookie } from "@/lib/hrms-auth";
import { normalizePmsRoles } from "@/lib/pms-roles";
import { createPmsSession, setPmsSessionCookie, clearPmsSessionCookie } from "@/lib/pms-auth";
import { normalizePrmsRoles } from "@/lib/prms-roles";
import { createPrmsSession, setPrmsSessionCookie, clearPrmsSessionCookie } from "@/lib/prms-auth";
import { normalizeFmsRoles } from "@/lib/fms-roles";
import { createFmsSession, setFmsSessionCookie, clearFmsSessionCookie } from "@/lib/fms-auth";
import { normalizeTmsRoles } from "@/lib/tms-roles";
import { createTmsSession, setTmsSessionCookie, clearTmsSessionCookie } from "@/lib/tms-auth";
import { normalizeChatRoles } from "@/lib/messenger-roles";
import { createMessengerSession, setMessengerSessionCookie, clearMessengerSessionCookie } from "@/lib/messenger-auth";
import { createLmsSession, setSessionCookie as setLmsSessionCookie, clearSessionCookie as clearLmsSessionCookie } from "@/lib/lms-auth";
import { hasSopAccess } from "@/lib/sop-roles";
import { createSopSession, setSopSessionCookie, clearSopSessionCookie } from "@/lib/sop-auth";
import { hasSeoAccess } from "@/lib/seo-roles";
import { hasDlmsAccess } from "@/lib/dlms-roles";
import { createDlmsSession, setDlmsSessionCookie, clearDlmsSessionCookie } from "@/lib/dlms-auth";
import { hasAibotsAccess } from "@/lib/aibots-roles";
import { createAibotsSession, setAibotsSessionCookie, clearAibotsSessionCookie } from "@/lib/aibots-auth";
import { hasSmmsAccess } from "@/lib/smms-roles";
import { createSmmsSession, setSmmsSessionCookie, clearSmmsSessionCookie } from "@/lib/smms-auth";
import { hasOtsAccess } from "@/lib/ots-roles";
import { createOtsSession, setOtsSessionCookie, clearOtsSessionCookie } from "@/lib/ots-auth";
import { createSeoSession, setSeoSessionCookie, clearSeoSessionCookie } from "@/lib/seo-auth";
import { hasCmsAccess } from "@/lib/cms-roles";
import { createCmsSession, setCmsSessionCookie, clearCmsSessionCookie } from "@/lib/cms-auth";
import { createHubSession, setHubSessionCookie, clearHubSessionCookie } from "@/lib/hub-auth";
import { loginSessions, LOGIN_COOKIE } from "@/lib/security/store";

/**
 * Cross-module single sign-on / sign-off. Every internal product shares one
 * identity store (`admin_users`), but each keeps its OWN independent
 * session/cookie. This module is the single place that knows about all of
 * them, so login can mint sessions everywhere access is real, and logout can
 * tear them all down everywhere at once.
 *
 * `provisionAccessibleSessions` mints a REAL session (that product's own
 * cookie, own session collection, own TTL) in every product the account's
 * CURRENT `roles` actually grant access to, so signing into any ONE product is
 * enough — no second login anywhere else. This grants nothing new: it only
 * saves a second login for access the account already has. Which roles an
 * account holds — and therefore which products get provisioned — is entirely
 * controlled by the Director at `/commandos/users`.
 *
 * `destroySessionsEverywhere` is the single-logout counterpart: logging out
 * of ANY one product destroys every session for that account, in every product,
 * on every device (there's no per-login "batch id" to scope a narrower
 * "just this device" logout without a larger schema change — see the plan
 * this shipped with for that trade-off, made deliberately).
 *
 * `lms` and `hub` have no role gate at all — any signed-in `admin_users`
 * account always gets a session there; every other module requires that
 * module's own real role.
 *
 * The External Portal is NOT included — it's a separate identity store
 * (`external_users`, not `admin_users`) keyed to individual client/student/
 * applicant records, structurally outside this system.
 */

export type SsoModule = "hrms" | "pms" | "prms" | "tms" | "messenger" | "lms" | "hub" | "fms" | "sop" | "seo" | "dlms" | "aibots" | "smms" | "ots" | "cms";

interface ModuleEntry {
  key: SsoModule;
  create: (adminId: ObjectId) => Promise<string>;
  setCookie: (token: string) => Promise<void>;
  clearCookie: () => Promise<void>;
  /**
   * The real Mongo collection holding this module's session documents.
   * `admin` and `lms` intentionally share `"admin_sessions"` — a pre-existing
   * accidental collision (their session *cookies* collided too, until the
   * LMS cookie was renamed to `lms_session`; the underlying collection name
   * was left as-is since fixing it needs a data migration for no functional
   * gain). `destroySessionsEverywhere` below dedupes collection names, so a
   * `deleteMany({ adminId })` against it correctly clears both sides in one
   * call. If you ever add a per-module session list/audit feature, this
   * shared collection is the first thing that will need a discriminator
   * field — this comment is here so an edit to one side doesn't silently
   * stop covering the other.
   */
  collection: string;
  /** Omitted (always-provision) for modules with no role gate at all. */
  hasAccess?: (roles: string[]) => boolean;
}

const MODULES: ModuleEntry[] = [
  {
    key: "hrms",
    create: createHrmsSession,
    setCookie: setHrmsSessionCookie,
    clearCookie: clearHrmsSessionCookie,
    collection: "hrms_sessions",
    hasAccess: (roles) => normalizeRoles(roles).length > 0,
  },
  {
    key: "pms",
    create: createPmsSession,
    setCookie: setPmsSessionCookie,
    clearCookie: clearPmsSessionCookie,
    collection: "pms_sessions",
    hasAccess: (roles) => normalizePmsRoles(roles).length > 0,
  },
  {
    key: "prms",
    create: createPrmsSession,
    setCookie: setPrmsSessionCookie,
    clearCookie: clearPrmsSessionCookie,
    collection: "prms_sessions",
    hasAccess: (roles) => normalizePrmsRoles(roles).length > 0,
  },
  {
    key: "fms",
    create: createFmsSession,
    setCookie: setFmsSessionCookie,
    clearCookie: clearFmsSessionCookie,
    collection: "fms_sessions",
    hasAccess: (roles) => normalizeFmsRoles(roles).length > 0,
  },
  {
    key: "sop",
    create: createSopSession,
    setCookie: setSopSessionCookie,
    clearCookie: clearSopSessionCookie,
    collection: "sop_sessions",
    hasAccess: (roles) => hasSopAccess(roles),
  },
  {
    key: "seo",
    create: createSeoSession,
    setCookie: setSeoSessionCookie,
    clearCookie: clearSeoSessionCookie,
    collection: "seo_sessions",
    hasAccess: (roles) => hasSeoAccess(roles),
  },
  {
    key: "cms",
    create: createCmsSession,
    setCookie: setCmsSessionCookie,
    clearCookie: clearCmsSessionCookie,
    collection: "cms_sessions",
    hasAccess: (roles) => hasCmsAccess(roles),
  },
  {
    key: "dlms",
    create: createDlmsSession,
    setCookie: setDlmsSessionCookie,
    clearCookie: clearDlmsSessionCookie,
    collection: "dlms_sessions",
    hasAccess: (roles) => hasDlmsAccess(roles),
  },
  {
    key: "aibots",
    create: createAibotsSession,
    setCookie: setAibotsSessionCookie,
    clearCookie: clearAibotsSessionCookie,
    collection: "aibots_sessions",
    hasAccess: (roles) => hasAibotsAccess(roles),
  },
  {
    key: "smms",
    create: createSmmsSession,
    setCookie: setSmmsSessionCookie,
    clearCookie: clearSmmsSessionCookie,
    collection: "smms_sessions",
    hasAccess: (roles) => hasSmmsAccess(roles),
  },
  {
    key: "ots",
    create: createOtsSession,
    setCookie: setOtsSessionCookie,
    clearCookie: clearOtsSessionCookie,
    collection: "ots_sessions",
    hasAccess: (roles) => hasOtsAccess(roles),
  },
  {
    key: "tms",
    create: createTmsSession,
    setCookie: setTmsSessionCookie,
    clearCookie: clearTmsSessionCookie,
    collection: "tms_sessions",
    hasAccess: (roles) => normalizeTmsRoles(roles).length > 0,
  },
  {
    key: "messenger",
    create: createMessengerSession,
    setCookie: setMessengerSessionCookie,
    clearCookie: clearMessengerSessionCookie,
    collection: "messenger_sessions",
    hasAccess: (roles) => normalizeChatRoles(roles).length > 0,
  },
  // Unconditional — no role gate on either of these products.
  { key: "lms", create: createLmsSession, setCookie: setLmsSessionCookie, clearCookie: clearLmsSessionCookie, collection: "admin_sessions" },
  { key: "hub", create: createHubSession, setCookie: setHubSessionCookie, clearCookie: clearHubSessionCookie, collection: "hub_sessions" },
];

/**
 * @param adminId The account's `admin_users._id`.
 * @param skip The module whose login action is calling this — it already
 *   created its own session for itself; skip re-provisioning it here to
 *   avoid a harmless but wasteful duplicate session document.
 */
export async function provisionAccessibleSessions(adminId: ObjectId, skip?: SsoModule): Promise<void> {
  const db = await getDb();
  const user = await db
    .collection<{ roles?: string[] }>("admin_users")
    .findOne({ _id: adminId }, { projection: { roles: 1 } });
  const roles = user?.roles ?? [];

  const jobs = MODULES.filter((m) => m.key !== skip && (m.hasAccess ? m.hasAccess(roles) : true)).map((m) =>
    m.create(adminId).then(m.setCookie)
  );

  await Promise.all(jobs);
}

/**
 * Single logout: destroys every session for this account across every
 * product (on every device — see the module doc comment above) and clears
 * every product's cookie in the current browser.
 */
export async function destroySessionsEverywhere(adminId: ObjectId): Promise<void> {
  const db = await getDb();
  await Promise.all(sessionCollectionNames().map((name) => db.collection(name).deleteMany({ adminId })));
  // The Security page's list: every sign-in of this account is over.
  await (await loginSessions()).updateMany({ adminId: adminId.toString(), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: "signed_out_everywhere" } }).catch(() => {});
  await clearAllSessionCookies();
}

/**
 * Ends every sign-in of ANOTHER person (their status changed, their access was removed): every product session is deleted and the
 * Security page's list shows them as ended. Unlike `destroySessionsEverywhere` it never touches the cookies of the browser making the
 * request, which belong to whoever is making the change.
 */
export async function revokeSessionsOf(adminId: ObjectId, reason: string): Promise<void> {
  const db = await getDb();
  await Promise.all(sessionCollectionNames().map((name) => db.collection(name).deleteMany({ adminId })));
  await (await loginSessions()).updateMany({ adminId: adminId.toString(), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }).catch(() => {});
}

/** Every Mongo collection that holds product sessions (the LMS and admin ones share one). */
export function sessionCollectionNames(): string[] {
  return [...new Set(MODULES.map((m) => m.collection))];
}

/** Clears every product's session cookie (and the Security page's device id) in the current browser. */
export async function clearAllSessionCookies(): Promise<void> {
  await Promise.all(MODULES.map((m) => m.clearCookie()));
  const store = await cookies();
  store.delete(LOGIN_COOKIE);
  // The separate admin product is gone; drop its cookie from browsers that still carry one.
  store.delete("admin_session");
}
