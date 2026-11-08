import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, forgetCompanyRouting, type Company } from "@/lib/platform/tenancy/companies";
import { getCompanyDetails, updateCompanyDetails } from "@/lib/products/talentos/company";
import { syncSiteContact } from "@/lib/platform/website/starter";
import { createDepartment, createDesignation, listDepartments, listDesignations } from "@/lib/products/talentos/departments";
import { isOnboardingOwner, postLoginTarget, showSetupStrip } from "@/lib/platform/onboarding/gate";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { getPlatformAccessForUser } from "@/lib/platform/console/roles";
import { COMPANY_SIZES, CURRENCIES, INDUSTRIES, MODULES, ONBOARDING_STEPS, type DepartmentTemplate, type Industry, type ModuleKey, type OnboardingStep } from "@/lib/platform/onboarding/catalog";

/**
 * Onboarding progress and the company-wide choices it records live on the
 * company's registry document (platform-level), so the platform console can
 * see every company's setup state without reading into its workspace.
 */

export interface CompanyProfile {
  industry: Industry;
  size: string;
  country: string;
  currency: string;
  timezone: string;
}

export interface OnboardingState {
  completedSteps: OnboardingStep[];
  completedAt: Date | null;
  dismissedAt: Date | null;
}

type CompanyDoc = Company & { profile?: CompanyProfile; onboarding?: OnboardingState; enabledModules?: ModuleKey[] };

async function companies() {
  return (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION);
}

export async function getOnboarding(): Promise<{ company: CompanyDoc; state: OnboardingState }> {
  const doc = await (await companies()).findOne({ _id: await currentCompanyId() });
  if (!doc) throw new Error("Company not found");
  // "Skip for now" writes only `onboarding.dismissedAt`, so a stored state can lack `completedSteps` —
  // always hand callers a complete state (the wizard and the setup strip both read the list).
  const stored = doc.onboarding;
  return { company: doc, state: { completedSteps: stored?.completedSteps ?? [], completedAt: stored?.completedAt ?? null, dismissedAt: stored?.dismissedAt ?? null } };
}

/** True while a (non-platform-owner) company's owner still has setup to do. */
export async function onboardingPending(): Promise<boolean> {
  const { company, state } = await getOnboarding();
  return !company.isPlatformOwner && !state.completedAt && !state.dismissedAt;
}

export async function markOnboardingStep(step: OnboardingStep): Promise<void> {
  const col = await companies();
  const id = await currentCompanyId();
  await col.updateOne({ _id: id }, { $addToSet: { "onboarding.completedSteps": step }, $set: { updatedAt: new Date() } });
  const doc = await col.findOne({ _id: id }, { projection: { onboarding: 1 } });
  if (ONBOARDING_STEPS.every((s) => doc?.onboarding?.completedSteps.includes(s.key))) {
    // Setup finished. The company's apps are NOT built automatically: a Director presses "Generate … App" in Settings → Apps.
    await col.updateOne({ _id: id, "onboarding.completedAt": { $in: [null, undefined] } }, { $set: { "onboarding.completedAt": new Date() } });
  }
}

export async function skipOnboarding(): Promise<void> {
  await (await companies()).updateOne({ _id: await currentCompanyId() }, { $set: { "onboarding.dismissedAt": new Date() } });
}

// ── Step 1: company profile ──────────────────────────────────────────────────

export interface ProfileInput {
  name: string;
  legalName: string;
  industry: string;
  size: string;
  country: string;
  currency: string;
  timezone: string;
  website: string;
  email: string;
  phone: string;
}

export type StepResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function saveProfile(input: ProfileInput, actorId: string): Promise<StepResult> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) errors.name = "Enter your company name.";
  if (!INDUSTRIES.some((i) => i.value === input.industry)) errors.industry = "Choose what your company does.";
  if (!COMPANY_SIZES.includes(input.size as (typeof COMPANY_SIZES)[number])) errors.size = "Choose a company size.";
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) errors.currency = "Choose a currency.";
  if (!input.country.trim()) errors.country = "Enter your country.";
  if (!isValidTimezone(input.timezone)) errors.timezone = "Choose a time zone.";
  const website = input.website.trim();
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website)) errors.website = "Enter a full URL, e.g. https://example.com";
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Enter a valid email.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const profile: CompanyProfile = { industry: input.industry as Industry, size: input.size, country: input.country.trim(), currency: input.currency, timezone: input.timezone };
  await (await companies()).updateOne({ _id: await currentCompanyId() }, { $set: { name, profile, updatedAt: new Date() } });
  forgetCompanyRouting();

  // The same identity HRMS prints on payslips and letters.
  const c = await getCompanyDetails();
  await updateCompanyDetails(
    {
      name,
      legalName: input.legalName.trim() || name,
      addressLine1: c.addressLine1,
      addressLine2: c.addressLine2,
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      country: input.country.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      website,
      pan: c.pan,
      gstin: c.gstin,
      cin: c.cin,
      pfEstablishmentCode: c.pfEstablishmentCode,
      esiEstablishmentCode: c.esiEstablishmentCode,
      lin: c.lin,
      tan: c.tan,
      ptRegistration: c.ptRegistration,
      signatoryName: c.signatoryName,
      signatoryDesignation: c.signatoryDesignation,
      payslipNote: c.payslipNote,
    },
    actorId,
  );
  // The public website's contact block starts blank; fill it from the profile (CMS edits win).
  await syncSiteContact({ email: input.email, phone: input.phone });
  await markOnboardingStep("profile");
  return { ok: true };
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}

// ── Step 2: departments & designations ───────────────────────────────────────

/** Creates the chosen departments/designations; anything that already exists (same name) is kept, not duplicated. */
export async function applyStructure(departments: DepartmentTemplate[], actorId: string): Promise<{ created: number }> {
  const existing = await listDepartments();
  const existingDesignations = await listDesignations();
  const byName = new Map(existing.map((d) => [d.name.trim().toLowerCase(), d]));
  const usedCodes = new Set(existing.map((d) => d.code));
  let created = 0;
  for (const dept of departments.slice(0, 30)) {
    const name = dept.name.trim().slice(0, 80);
    if (!name) continue;
    let department = byName.get(name.toLowerCase());
    if (!department) {
      let code = (dept.code || name.replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase() || "DEP";
      for (let i = 2; usedCodes.has(code); i++) code = `${code.replace(/\d+$/, "")}${i}`;
      usedCodes.add(code);
      department = await createDepartment({ name, code }, actorId);
      byName.set(name.toLowerCase(), department);
      created++;
    }
    const have = new Set(existingDesignations.filter((d) => d.departmentId === department!._id).map((d) => d.title.trim().toLowerCase()));
    for (const title of dept.designations.slice(0, 20)) {
      const t = title.trim().slice(0, 80);
      if (!t || have.has(t.toLowerCase())) continue;
      await createDesignation({ title: t, departmentId: department._id }, actorId);
      have.add(t.toLowerCase());
      created++;
    }
  }
  await markOnboardingStep("structure");
  return { created };
}

// ── Step 3: team (invitations are sent from the step itself) ─────────────────

export async function completeTeamStep(): Promise<void> {
  await markOnboardingStep("team");
}

// ── Step 4: products ───────────────────────────────────────────────────────────

export async function saveModules(keys: string[]): Promise<void> {
  // Products the platform switched off (for everyone or for this company) can't be chosen.
  const off = await unavailablePanelKeys(await currentCompanyId());
  const valid = new Set<string>(MODULES.filter((m) => !off.has(m.key)).map((m) => m.key));
  const core = MODULES.filter((m) => m.core).map((m) => m.key);
  const enabled = Array.from(new Set([...core, ...keys.filter((k) => valid.has(k))])) as ModuleKey[];
  await (await companies()).updateOne({ _id: await currentCompanyId() }, { $set: { enabledModules: enabled, updatedAt: new Date() } });
  await markOnboardingStep("modules");
}

/**
 * Which products this company uses. `null` = no choice recorded (the platform
 * owner, companies created before onboarding existed) → everything is on.
 */
export async function enabledModules(): Promise<Set<string> | null> {
  const doc = await (await companies()).findOne({ _id: await currentCompanyId() }, { projection: { enabledModules: 1 } });
  if (!doc?.enabledModules) return null;
  const set = new Set(doc.enabledModules);
  set.add("lpms");
  return set;
}

/** Landing path after a sign-in (see `gate.ts`), for the signed-in company's own data. Fails soft to the dashboard. */
export async function loginLanding(roles: readonly string[], requestedNext: string | null, userId?: string): Promise<string> {
  try {
    const { company, state } = await getOnboarding();
    // The product's own staff (SelfRun) open on the Platform Console; an explicit `next` still wins.
    if (!requestedNext && company.isPlatformOwner && userId && (await getPlatformAccessForUser(userId))) return "/console";
    return postLoginTarget({ isOwner: isOnboardingOwner(roles), isPlatformOwnerCompany: company.isPlatformOwner === true, state, requestedNext });
  } catch {
    return requestedNext ?? "/commandos";
  }
}

/** True while an owner's setup is not completed (skipped or not): drives the Workspace strip. */
export async function setupStripNeeded(roles: readonly string[]): Promise<{ show: boolean; done: number; total: number }> {
  const total = ONBOARDING_STEPS.length;
  if (!isOnboardingOwner(roles)) return { show: false, done: 0, total };
  const { company, state } = await getOnboarding();
  return { show: showSetupStrip({ isOwner: true, isPlatformOwnerCompany: company.isPlatformOwner === true, state }), done: state.completedSteps.length, total };
}
