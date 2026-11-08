import { passwordPolicyError } from "@/lib/security/password";
import { platformEvents } from "@/lib/notify/triggers/platform";
import "server-only";
import { resolveBusiness, type BusinessSelection } from "@/lib/platform/business-taxonomy";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { companyAppBaseUrl, createCompanyWithOwner, isSlugTaken, slugFormatError } from "@/lib/platform/tenancy/provisioning";
import { getSignupMode, platformEmailIdentity, reservedSlugError } from "@/lib/platform/settings";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { hashPassword } from "@/lib/lms-auth";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { sendVerificationEmail } from "@/lib/platform/email-verification";
import { headers } from "next/headers";
import { resolveSignupPlan } from "@/lib/platform/billing/signup-plan";

/** Country, browser languages and time zone the sign-up request carries (when the host or CDN provides them). Used only to tailor the website. */
async function requestHints(): Promise<{ country?: string; languages?: string; timezone?: string }> {
  try {
    const h = await headers();
    const country = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || h.get("cloudfront-viewer-country") || "").trim().toUpperCase();
    return {
      ...(/^[A-Z]{2}$/.test(country) && country !== "XX" ? { country } : {}),
      ...(h.get("accept-language") ? { languages: h.get("accept-language")!.slice(0, 120) } : {}),
      ...(h.get("x-vercel-ip-timezone") ? { timezone: h.get("x-vercel-ip-timezone")!.slice(0, 60) } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Self-serve company sign-up. Email verification does NOT gate it:
 *  - `open`: `startSignup` validates, rate-limits, creates the company, owner,
 *    subdomain, trial and starter website at once (owner `emailVerified: false`),
 *    emails a verification link (never blocking) and returns a one-time hand-off
 *    URL on the new company's host. The hand-off (`consumeHandoff`) signs the
 *    owner in there — cookies can't cross domains — and the Workspace shows the
 *    "Verify email" strip until the link is used (`email-verification.ts`).
 *  - `approval`: `startSignup` stores the request (password already hashed) for a
 *    platform admin, who approves (`approveSignup`, which creates the company
 *    exactly as open mode does) or rejects it from the platform console.
 *  - `closed`: nothing is accepted.
 * `confirmSignup` / `describePendingSignup` only serve links from the old
 * "confirm by email first" flow that were already in someone's inbox.
 */

const PENDING = "pending_signups";
const ATTEMPTS = "signup_attempts";
const HANDOFFS = "login_handoffs";
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const HANDOFF_TTL_MS = 2 * 60 * 1000;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_EMAIL_PER_HOUR = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export { MIN_PASSWORD_LENGTH } from "@/lib/security/password";

interface PendingSignup {
  _id: string;
  tokenHash: string;
  email: string;
  name: string;
  companyName: string;
  slug: string;
  passwordHash: string;
  business?: BusinessSelection;
  /** The plan picked on the pricing page, started as a free trial once the company exists. */
  plan?: { id: string; interval: "monthly" | "yearly" };
  status: "pending" | "awaiting_approval";
  createdAt: Date;
  expiresAt: Date;
}

interface Handoff {
  _id: string; // sha256 of the token
  companyId: string;
  adminId: string;
  next: string;
  expiresAt: Date;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let indexesEnsured = false;
async function collections() {
  const db = await getPlatformDb();
  const pending = db.collection<PendingSignup>(PENDING);
  const attempts = db.collection<{ key: string; at: Date }>(ATTEMPTS);
  const handoffs = db.collection<Handoff>(HANDOFFS);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      pending.createIndex({ tokenHash: 1 }, { unique: true }),
      pending.createIndex({ email: 1 }),
      pending.createIndex({ slug: 1 }),
      pending.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      attempts.createIndex({ key: 1, at: 1 }),
      attempts.createIndex({ at: 1 }, { expireAfterSeconds: 3600 }),
      handoffs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch((err) => console.error("[signup] index setup failed", err));
  }
  return { pending, attempts, handoffs };
}

export interface SignupInput {
  companyName: string;
  slug: string;
  name: string;
  email: string;
  password: string;
  /** Business category codes, sub-category codes (see business-taxonomy.ts — multi-select) and, for "Other", a short description. */
  businessCategories: string[];
  businessSubCategories: string[];
  acceptTerms: boolean;
  /** From the pricing page (`/signup?plan=…&interval=…`); checked on the server, ignored when it is not a plan that can be started. */
  planId?: string;
  interval?: string;
}

export type SignupFieldErrors = Partial<Record<keyof SignupInput | "form", string>>;

export function validateSignup(input: SignupInput): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (input.companyName.trim().length < 2) errors.companyName = "Enter your company name.";
  if (input.companyName.length > 100) errors.companyName = "Keep the company name under 100 characters.";
  const slugError = slugFormatError(input.slug);
  if (slugError) errors.slug = slugError;
  if (input.name.trim().length < 2) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(input.email.trim())) errors.email = "Enter a valid email address.";
  { const weak = passwordPolicyError(input.password, { email: input.email }); if (weak) errors.password = weak; }
  const business = resolveBusiness(input.businessCategories, input.businessSubCategories);
  if (!business.ok) Object.assign(errors, business.errors);
  if (!input.acceptTerms) errors.acceptTerms = "Accept the terms to continue.";
  return errors;
}

/**
 * Everything the sign-up form can be rejected for on the server, WITHOUT creating anything or counting a rate-limit
 * attempt: field rules, reserved and taken addresses, closed sign-ups. The form calls this first and only starts the
 * "creating your workspace" progress once it passes; `startSignup` then does the real work (and re-checks).
 */
export async function precheckSignup(input: SignupInput): Promise<SignupFieldErrors> {
  if ((await getSignupMode()) === "closed") return { form: "New sign-ups are paused right now. Please try again later." };
  const errors = validateSignup(input);
  if (!errors.slug) {
    const reserved = await reservedSlugError(input.slug);
    if (reserved) errors.slug = reserved;
  }
  if (!errors.slug && !(await isSlugAvailable(input.slug, input.email))) errors.slug = "That workspace address is taken.";
  return errors;
}

/** Taken by a live company, or held by someone else's unexpired sign-up. */
export async function isSlugAvailable(slug: string, forEmail?: string): Promise<boolean> {
  if (slugFormatError(slug) || (await reservedSlugError(slug))) return false;
  if (await isSlugTaken(slug)) return false;
  const { pending } = await collections();
  const held = await pending.findOne({ slug, expiresAt: { $gt: new Date() } }, { projection: { email: 1 } });
  return !held || held.email === forEmail?.trim().toLowerCase();
}

async function rateLimited(keys: { key: string; max: number }[]): Promise<boolean> {
  const { attempts } = await collections();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  for (const { key, max } of keys) {
    if ((await attempts.countDocuments({ key, at: { $gt: since } })) >= max) return true;
  }
  await attempts.insertMany(keys.map(({ key }) => ({ key, at: new Date() })));
  return false;
}

export type StartSignupResult =
  | { ok: true; kind: "created"; redirectTo: string }
  | { ok: true; kind: "awaiting_approval"; email: string }
  | { ok: false; errors: SignupFieldErrors };

/** One-time sign-in token for the new owner, redeemed on the company's own host. */
/** A one-time sign-in link for a Platform Console user to enter a company's products as that company's Director (`next` is where it lands). */
export async function issueSupportHandoff(created: { companyId: string; adminId: string }, appBase: string, next = "/commandos?via=platform"): Promise<string> {
  const { handoffs } = await collections();
  const handoff = randomBytes(32).toString("hex");
  await handoffs.insertOne({ _id: sha256(handoff), companyId: created.companyId, adminId: created.adminId, next, expiresAt: new Date(Date.now() + HANDOFF_TTL_MS) });
  return `${appBase}/commandos/handoff?token=${handoff}`;
}

async function issueHandoff(created: { companyId: string; adminId: string }, base: string): Promise<string> {
  const { handoffs } = await collections();
  const handoff = randomBytes(32).toString("hex");
  await handoffs.insertOne({ _id: sha256(handoff), companyId: created.companyId, adminId: created.adminId, next: "/commandos", expiresAt: new Date(Date.now() + HANDOFF_TTL_MS) });
  return `${base}/commandos/handoff?token=${handoff}`;
}

/** Sends the verification link from the new company's context. Never throws and never fails the sign-up. */
async function sendOwnerVerification(created: { companyId: string; adminId: string }, base: string) {
  try {
    const res = await runAsCompany(created.companyId, () => sendVerificationEmail(created.adminId, base));
    if (!res.ok) console.error(`[signup] verification email not sent: ${res.error}`);
  } catch (err) {
    console.error("[signup] verification email failed", err);
  }
}

/** `hostHint` = the Host the form was submitted on (only used to build the company's address on localhost). */
export async function startSignup(input: SignupInput, ctx: { hostHint: string | null; clientKey: string }): Promise<StartSignupResult> {
  const mode = await getSignupMode();
  if (mode === "closed") return { ok: false, errors: { form: "New sign-ups are paused right now. Please try again later." } };

  const errors = validateSignup(input);
  // Subdomains reserved in Platform Console → Platform settings, on top of the built-in list.
  if (!errors.slug) {
    const reserved = await reservedSlugError(input.slug);
    if (reserved) errors.slug = reserved;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const email = input.email.trim().toLowerCase();

  if (await rateLimited([{ key: `ip:${ctx.clientKey}`, max: MAX_PER_IP_PER_HOUR }, { key: `email:${email}`, max: MAX_PER_EMAIL_PER_HOUR }])) {
    return { ok: false, errors: { form: "Too many sign-up attempts. Please wait an hour and try again." } };
  }
  if (!(await isSlugAvailable(input.slug, email))) return { ok: false, errors: { slug: "That workspace address is taken." } };

  const business = (resolveBusiness(input.businessCategories, input.businessSubCategories) as { ok: true; value: BusinessSelection }).value;
  const picked = await resolveSignupPlan(input.planId, input.interval);
  const plan = picked ? { id: picked.planId, interval: picked.interval } : undefined;
  const passwordHash = hashPassword(input.password);
  const companyName = input.companyName.trim();
  const name = input.name.trim();

  if (mode === "approval") {
    const { pending } = await collections();
    const now = new Date();
    // One request per email: submitting again replaces the earlier one.
    await pending.deleteMany({ email, status: "awaiting_approval" });
    await pending.insertOne({
      _id: randomUUID(),
      tokenHash: sha256(randomBytes(32).toString("hex")), // no link exists for these; the unique index still needs a value
      email,
      name,
      companyName,
      slug: input.slug,
      passwordHash,
      business,
      ...(plan ? { plan } : {}),
      status: "awaiting_approval",
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * PENDING_TTL_MS),
    });
    return { ok: true, kind: "awaiting_approval", email };
  }

  const created = await createCompanyWithOwner({ name: companyName, slug: input.slug, owner: { email, name, passwordHash, mustChangePassword: false, emailVerified: false }, business, ...(plan ? { plan } : {}), aiWebsite: "wait", hints: await requestHints() });
  // "Address just taken" (two sign-ups racing for it) belongs on the address field.
  if (!created.ok) return { ok: false, errors: /address/i.test(created.error) ? { slug: created.error } : { form: created.error } };

  const base = companyAppBaseUrl(input.slug, ctx.hostHint);
  await sendOwnerVerification(created, base);
  return { ok: true, kind: "created", redirectTo: await issueHandoff(created, base) };
}

export async function describePendingSignup(token: string): Promise<{ companyName: string; slug: string; email: string } | null> {
  const { pending } = await collections();
  const doc = await pending.findOne({ tokenHash: sha256(token), status: "pending", expiresAt: { $gt: new Date() } });
  return doc ? { companyName: doc.companyName, slug: doc.slug, email: doc.email } : null;
}

export type ConfirmResult = { ok: true; redirectTo: string } | { ok: true; awaitingApproval: true } | { ok: false; error: string };

export async function confirmSignup(token: string, ctx: { hostHint: string | null }): Promise<ConfirmResult> {
  const { pending } = await collections();
  // Claim atomically: a double-click (or two tabs) can only create one company.
  const doc = await pending.findOneAndDelete({ tokenHash: sha256(token), status: "pending", expiresAt: { $gt: new Date() } });
  if (!doc) return { ok: false, error: "This link has expired or was already used. Start again to get a new one." };

  if ((await getSignupMode()) === "approval") {
    await pending.insertOne({ ...doc, status: "awaiting_approval", expiresAt: new Date(Date.now() + 30 * PENDING_TTL_MS) });
    await platformEvents.signupAwaiting(doc.companyName, doc.email);
    return { ok: true, awaitingApproval: true };
  }

  const created = await createCompanyWithOwner({
    name: doc.companyName,
    slug: doc.slug,
    owner: { email: doc.email, name: doc.name, passwordHash: doc.passwordHash, mustChangePassword: false, emailVerified: true }, // confirmed through the emailed link
    business: doc.business,
    ...(doc.plan ? { plan: doc.plan } : {}),
  });
  if (!created.ok) {
    // Put it back so the user can retry from the same link once they've been told why.
    await pending.insertOne(doc);
    return { ok: false, error: created.error };
  }

  const base = companyAppBaseUrl(doc.slug, ctx.hostHint);
  void sendWorkspaceReadyEmail(doc, base);
  await platformEvents.companyCreated(doc.companyName, doc.email, created.companyId);

  return { ok: true, redirectTo: await issueHandoff(created, base) };
}

async function sendWorkspaceReadyEmail(doc: PendingSignup, base: string, approved = false) {
  const platform = await platformEmailIdentity();
  const { html, text } = renderEmail({
    brand: doc.companyName,
    heading: approved ? "Your workspace has been approved" : "Your workspace is ready",
    paragraphs: [`Hi ${doc.name},`, `${doc.companyName} is set up. Sign in any time at your workspace address with the password you chose:`, base],
    action: { label: "Open your workspace", url: `${base}/commandos/login` },
    ...(platform.supportLine ? { footnote: platform.supportLine } : {}),
  });
  return sendEmail({ to: doc.email, subject: `Welcome — ${doc.companyName} is ready`, html, text });
}

// ── Approval queue (sign-up mode "approval"; decided in the platform console) ──

export interface AwaitingApproval {
  id: string;
  email: string;
  name: string;
  companyName: string;
  slug: string;
  createdAt: Date;
  expiresAt: Date;
}

export async function countAwaitingApproval(): Promise<number> {
  const { pending } = await collections();
  return pending.countDocuments({ status: "awaiting_approval", expiresAt: { $gt: new Date() } });
}

/** Oldest first. Never exposes the password hash or token hash. */
export async function listAwaitingApproval(): Promise<AwaitingApproval[]> {
  const { pending } = await collections();
  const docs = await pending
    .find({ status: "awaiting_approval", expiresAt: { $gt: new Date() } }, { projection: { email: 1, name: 1, companyName: 1, slug: 1, createdAt: 1, expiresAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map((d) => ({ id: d._id, email: d.email, name: d.name, companyName: d.companyName, slug: d.slug, createdAt: d.createdAt, expiresAt: d.expiresAt }));
}

export type ApprovalResult = { ok: true; companyId: string; host: string; emailed: boolean } | { ok: false; error: string };

/**
 * Creates the company exactly as a confirmed sign-up in open mode would, then
 * emails the owner a sign-in link. Claimed atomically, so two admins clicking
 * Approve at once create one company; on failure the request goes back in the
 * queue with the reason reported.
 */
export async function approveSignup(id: string, ctx: { hostHint: string | null }): Promise<ApprovalResult> {
  const { pending } = await collections();
  const doc = await pending.findOneAndDelete({ _id: id, status: "awaiting_approval" });
  if (!doc) return { ok: false, error: "This request was already decided or has expired." };

  if (await isSlugTaken(doc.slug)) {
    await pending.insertOne(doc);
    return { ok: false, error: `The address "${doc.slug}" is now used by another company. Reject this request and ask ${doc.email} to sign up again with a different address.` };
  }
  const created = await createCompanyWithOwner({
    name: doc.companyName,
    slug: doc.slug,
    owner: { email: doc.email, name: doc.name, passwordHash: doc.passwordHash, mustChangePassword: false, emailVerified: false },
    business: doc.business,
    ...(doc.plan ? { plan: doc.plan } : {}),
  });
  if (!created.ok) {
    await pending.insertOne(doc);
    return { ok: false, error: created.error };
  }
  const base = companyAppBaseUrl(doc.slug, ctx.hostHint);
  await sendOwnerVerification(created, base);
  const sent = await sendWorkspaceReadyEmail(doc, base, true);
  await platformEvents.companyCreated(doc.companyName, doc.email, created.companyId);
  return { ok: true, companyId: created.companyId, host: created.host, emailed: sent.ok };
}

/** Drops the request (and its stored password hash) and lets the person know. */
export async function rejectSignup(id: string): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const { pending } = await collections();
  const doc = await pending.findOneAndDelete({ _id: id, status: "awaiting_approval" });
  if (!doc) return { ok: false, error: "This request was already decided or has expired." };
  const platform = await platformEmailIdentity();
  const { html, text } = renderEmail({
    brand: platform.name,
    heading: "About your workspace request",
    ...(platform.supportLine ? { footnote: platform.supportLine } : {}),
    paragraphs: [
      `Hi ${doc.name},`,
      `Thank you for your interest in creating ${doc.companyName} on ${platform.name}. We're not able to approve this request at the moment, so no workspace has been created and your details have been removed.`,
      "If you think this is a mistake, simply reply to this email and we'll take another look.",
    ],
  });
  const sent = await sendEmail({ to: doc.email, subject: `About your ${platform.name} workspace request`, html, text });
  return { ok: true, emailed: sent.ok };
}

/** Single-use: returns who to sign in, only for the company the request is on. */
export async function consumeHandoff(token: string, companyId: string): Promise<{ adminId: string; next: string } | null> {
  const { handoffs } = await collections();
  const doc = await handoffs.findOneAndDelete({ _id: sha256(token), companyId, expiresAt: { $gt: new Date() } });
  return doc ? { adminId: doc.adminId, next: doc.next } : null;
}
