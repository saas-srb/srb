import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { accessToLegacy, baselineFeatures, completeAccess, legacyToAccess } from "@/lib/access/adapter";
import { normalizeAccess } from "@/lib/access/can";
import { CATALOGUE, PRODUCTS, isAccessGate } from "@/lib/access/catalogue";
import { completeWith, WORKSPACE_PRODUCT } from "@/lib/access/complete";
import type { AccessMap } from "@/lib/access/types";
import { buildAccessUi, type AccessUiModel } from "@/lib/access/ui-model";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { productKeyFromSlug } from "@/lib/platform/saas/product-routes";
import { microByKey, isFinished, microOf, FINISHED_PRODUCTS } from "@/lib/access/micro";
import { withMicros } from "@/lib/access/micro/derive";
import { summarizeAccess, productCount, type ProductSummary } from "@/lib/access/summary";
import { listDepartments, listDesignations, listTeams } from "@/lib/platform/organization";
import { inviteTeammate, type InvitedPerson } from "@/lib/platform/invitations";
import { countSeatsUsed, newAccountBlockReason, rolesUseSeat } from "@/lib/platform/billing/enforce";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { canSignIn } from "@/lib/security/account-status";
import {
  createPersonAccount, updatePersonAccount, delegatedManagerBlock, DIRECTOR_DESIGNATION_ID, ADMIN_USERS_COLLECTION,
  type AdminUserDoc, type CreateAdminUserResult,
} from "@/lib/products/commandos/admin-users";
import { recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { cleanDetails, directorLockReason, hasAnyProduct, seatVerdict, validateDetails, type PersonDetails, type PersonDraft, type SeatVerdict } from "@/lib/products/commandos/people-rules";

/**
 * People & Access, server side: checks a draft, creates a person (temporary password or email invitation) and saves changes. Saving writes
 * the access map AND the legacy roles / permission overrides derived from it through the adapter, so every product keeps working.
 */

const DIRECTOR = "super_admin";
const label = (key: string) => CATALOGUE.find((e) => e.key === key)?.label ?? microByKey(key)?.label ?? key;

export interface AccessCheck {
  /** The completed map that will be saved (picked features, product gates, baselines, Workspace baseline). */
  access: AccessMap;
  roles: string[];
  overrides: Record<string, boolean>;
  /** Features older roles would give on top of the picked ones: the map is refused until they are unpicked. */
  widened: string[];
  /** Picked features the older products cannot honour yet (the new checks do). */
  withheld: string[];
  /** Features added automatically (baseline), compared with what was picked. */
  addedAutomatically: string[];
  products: number;
  summary: ProductSummary[];
  /** A plain-language explanation of widened / withheld, empty when exact. */
  explanation: string[];
}

const productOfKey = (key: string) => CATALOGUE.find((e) => e.key === key)?.product ?? microByKey(key)?.product ?? key.split(".")[0];

/** Whether an access-catalogue product (a URL slug such as "talentos") is one the company can't use. CommandOS never is. */
export function isHiddenAccessProduct(product: string, hidden: ReadonlySet<string>): boolean {
  return product !== WORKSPACE_PRODUCT && hidden.has(productKeyFromSlug(product) ?? product);
}

/** The products the access screens offer: the company's own. */
export function accessUiFor(hidden: ReadonlySet<string>): AccessUiModel {
  const ui = buildAccessUi();
  return hidden.size === 0 ? ui : { ...ui, products: ui.products.filter((p) => !isHiddenAccessProduct(p.key, hidden)) };
}

/** Completes and checks a draft access map. Pure with respect to the database. */
export function checkAccess(input: unknown, opts: { isDirector?: boolean; hidden?: ReadonlySet<string> } = {}): AccessCheck {
  const picked = normalizeAccess(input);
  const completed = opts.isDirector ? picked : completeAccess(picked);
  const derived = accessToLegacy(completed, { isDirector: opts.isDirector });
  const hidden = opts.hidden ?? new Set<string>();
  const ui = accessUiFor(hidden);
  // Access to a product the company doesn't have is kept (it comes back with the product) but is not talked about.
  const seen = (key: string) => !isHiddenAccessProduct(productOfKey(key), hidden);
  const widened = derived.widened.filter(seen);
  const withheld = derived.withheld.filter(seen);
  const addedAutomatically: string[] = [];
  for (const [p, m] of Object.entries(completed)) for (const k of Object.keys(m)) if (!isHiddenAccessProduct(p, hidden) && !picked[p]?.[k] && CATALOGUE.find((e) => e.key === k)?.kind !== "tier" && !(isFinished(p) && CATALOGUE.some((e) => e.key === k))) addedAutomatically.push(label(k));
  const summary = summarizeAccess(completed, ui.products, opts.isDirector);
  const explanation: string[] = [];
  if (widened.length) explanation.push(`These would also be allowed because older roles bundle them with what you picked: ${widened.map(label).join(", ")}. Remove the related feature or choose a different level.`);
  if (withheld.length) explanation.push(`These are saved but older parts of the product cannot honour them yet, so they show as not available there: ${withheld.map(label).join(", ")}.`);
  return {
    access: completed, roles: derived.roles, overrides: derived.permissionOverrides,
    widened: widened.map(label), withheld: withheld.map(label), addedAutomatically: [...new Set(addedAutomatically)],
    products: productCount(summary), summary, explanation,
  };
}

/** Splits the legacy-derived map of an existing person into what to show as picked: baselines and leaked access of other products are not "picked". */
export function prefillFromLegacy(user: { roles: string[]; permissionOverrides?: Record<string, boolean> | null }): { isDirector: boolean; picked: AccessMap } {
  const { isDirector, access } = legacyToAccess({ roles: user.roles, permissionOverrides: user.permissionOverrides ?? null });
  if (isDirector) return { isDirector, picked: {} };
  return { isDirector, picked: splitPicked(access) };
}

/** Keeps in `picked` the real features of products the person truly uses; access that is only the baseline another product brings is dropped. */
export function splitPicked(input: AccessMap): AccessMap {
  const access = withMicros(input);
  const real: AccessMap = {};
  const tiers: AccessMap = {};
  for (const e of CATALOGUE) {
    const held = access[e.product]?.[e.key];
    if (!held) continue;
    ((e.kind === "tier" ? tiers : real)[e.product] ??= {})[e.key] = held;
  }
  // Products with at least one real feature that no other product's baseline explains.
  const used = new Set<string>();
  for (const product of PRODUCTS) {
    if (product === WORKSPACE_PRODUCT) continue;
    const keys = Object.keys(real[product] ?? {});
    if (keys.length === 0) continue;
    const explained = new Set(PRODUCTS.filter((q) => q !== product && Object.keys(real[q] ?? {}).length > 0).flatMap((q) => baselineFeatures(q)));
    if (keys.some((k) => !explained.has(k))) used.add(product);
  }
  // A finished product whose ordinary people hold nothing but the product tier (Huddle: every employee) is still "used" when they hold one of its
  // non-baseline features: without this their whole access would not be shown as picked.
  for (const product of FINISHED_PRODUCTS) {
    if (used.has(product) || product === WORKSPACE_PRODUCT || !Object.keys(tiers[product] ?? {}).length) continue;
    const tierKeys = new Set(CATALOGUE.filter((e) => e.product === product && e.kind === "tier").map((e) => e.key));
    if (microOf(product).some((m) => access[product]?.[m.key] && !m.baseline && m.legacy.every((l) => tierKeys.has(l)))) used.add(product);
  }
  const picked: AccessMap = {};
  for (const product of used) {
    const own = new Set(baselineFeatures(product));
    // A finished product is picked in micro features (the legacy capabilities are derived from them).
    if (isFinished(product)) { for (const m of microOf(product)) { const held = access[product]?.[m.key]; if (held) (picked[product] ??= {})[m.key] = held; } continue; }
    for (const k of Object.keys(real[product] ?? {})) (picked[product] ??= {})[k] = real[product][k];
    void own;
    for (const [k, v] of Object.entries(tiers[product] ?? {})) if (!isAccessGate(k.split(".")[1] ?? "")) (picked[product] ??= {})[k] = v;
  }
  return picked;
}

export interface PersonValidation {
  ok: boolean;
  errors: Record<string, string>;
  details: PersonDetails;
  check: AccessCheck | null;
  seats: SeatVerdict;
  /** The refusal to show, when the draft cannot be saved. */
  refusal: string | null;
}

async function orgLookup() {
  const [departments, teams, designations] = await Promise.all([listDepartments(), listTeams(), listDesignations()]);
  return { departments, teams, designations };
}

async function seatsFor(roles: string[], existing?: { roles?: string[]; status?: string } | null): Promise<SeatVerdict> {
  const [used, ent] = await Promise.all([countSeatsUsed(), getEntitlements()]);
  const holds = existing ? rolesUseSeat(existing.roles) && canSignIn(existing as never) : false;
  return seatVerdict({ used, limit: ent.limits.seats, takesSeat: rolesUseSeat(roles), alreadyHoldsSeat: holds });
}

/** Everything the Preview step needs and everything save checks. `personId` set = editing. */
export async function validateDraft(draftIn: Partial<PersonDraft>, personId?: string): Promise<PersonValidation> {
  const details = cleanDetails(draftIn);
  const org = await orgLookup();
  const col = (await getDb()).collection<AdminUserDoc>(ADMIN_USERS_COLLECTION);
  const existing = personId && ObjectId.isValid(personId) ? await col.findOne({ _id: new ObjectId(personId) }) : null;
  const isDirector = Boolean(existing?.roles?.includes(DIRECTOR));
  const clash = await col.findOne({ email: details.email, ...(existing ? { _id: { $ne: existing._id } } : {}) }, { projection: { _id: 1 } });
  const errors = validateDetails(details, { isDirector, existingEmail: Boolean(clash) });
  for (const [field, ids, list] of [["departmentIds", details.departmentIds, org.departments], ["teamIds", details.teamIds, org.teams], ["designationIds", details.designationIds, org.designations]] as const) {
    if (ids.some((id) => !list.some((x) => x._id === id))) errors[field] = "One of the choices no longer exists. Refresh and choose again.";
  }
  const check = checkAccess(draftIn.access ?? {}, { isDirector, hidden: await hiddenProducts() });
  let refusal: string | null = null;
  if (!isDirector) {
    if (check.widened.length) refusal = check.explanation[0];
    else if (!hasAnyProduct(normalizeAccess(draftIn.access ?? {}))) refusal = "Give access to at least one product, otherwise the person can sign in but reach nothing.";
  }
  const seats = await seatsFor(check.roles, existing);
  if (!seats.ok && !refusal) refusal = seats.message;
  return { ok: Object.keys(errors).length === 0 && !refusal, errors, details, check, seats, refusal };
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  id?: string;
  tempPassword?: string;
  invitedEmail?: string;
  hrWarning?: string;
  withheld?: string[];
}

const nameOf = (list: { _id: string; name?: string; title?: string }[], id: string) => list.find((x) => x._id === id);

function plan(v: PersonValidation, org: Awaited<ReturnType<typeof orgLookup>>) {
  const main = nameOf(org.designations, v.details.designationIds[0] ?? "");
  const dept = nameOf(org.departments, v.details.departmentIds[0] ?? "");
  return { designationTitle: main?.title ?? "Team Member", departmentName: dept?.name ?? null };
}

/** Creates a person from the 3-step screen. */
export async function createPerson(draft: Partial<PersonDraft>, actor: { id: string; email: string; roles: readonly string[] }, origin: string): Promise<SaveResult> {
  const v = await validateDraft(draft);
  if (Object.keys(v.errors).length) return { ok: false, errors: v.errors, error: "Some details need fixing." };
  if (v.refusal || !v.check) return { ok: false, error: v.refusal ?? "This access cannot be saved." };
  const blocked = await delegatedManagerBlock(actor, { roles: v.check.roles, overrides: Object.keys(v.check.overrides).length > 0, access: v.check.access });
  if (blocked) return { ok: false, error: blocked };
  const org = await orgLookup();
  const p = plan(v, org);
  const d = v.details;
  let result: SaveResult;
  if (d.invite === "email") {
    const person: InvitedPerson = {
      access: v.check.access, derivedRoles: v.check.roles, derivedOverrides: v.check.overrides, phone: d.phone, joiningDate: d.joiningDate, userType: d.userType,
      departmentIds: d.departmentIds, teamIds: d.teamIds, designationIds: d.designationIds, designationTitle: p.designationTitle,
    };
    const res = await inviteTeammate({ email: d.email, name: d.name, preset: "access", person, departmentId: d.departmentIds[0] ?? null, designationId: d.designationIds[0] ?? null }, { id: actor.id, email: actor.email }, origin);
    if (!res.ok) return { ok: false, error: res.error };
    result = { ok: true, invitedEmail: res.email, withheld: v.check.withheld };
  } else {
    const seat = await newAccountBlockReason(v.check.roles);
    if (seat) return { ok: false, error: seat };
    const res: CreateAdminUserResult = await createPersonAccount({
      email: d.email, name: d.name, phone: d.phone, joiningDate: d.joiningDate, userType: d.userType, departmentIds: d.departmentIds, teamIds: d.teamIds, designationIds: d.designationIds,
      access: v.check.access, roles: v.check.roles, overrides: v.check.overrides, designationTitle: p.designationTitle, departmentName: p.departmentName,
    }, actor.id);
    if (!res.ok) return { ok: false, error: res.error };
    result = { ok: true, id: res.id, tempPassword: res.tempPassword, hrWarning: res.hrWarning, withheld: v.check.withheld };
  }
  await recordAccessAudit({
    actorId: actor.id, action: "user.created", target: d.email,
    detail: `${d.invite === "email" ? "invited by email" : "temporary password"}; ${v.check.products} product(s); ${countFeatures(v.check.access)} feature(s); designations: ${d.designationIds.length}`,
  });
  return result;
}

const countFeatures = (a: AccessMap) => Object.values(a).reduce((n, m) => n + Object.keys(m).length, 0);

/** Saves changes to an existing person. A Director's details can change; their access cannot. */
export async function updatePerson(id: string, draft: Partial<PersonDraft>, actor: { id: string; email: string; roles: readonly string[] }): Promise<SaveResult> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  const col = (await getDb()).collection<AdminUserDoc>(ADMIN_USERS_COLLECTION);
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) return { ok: false, error: "Unknown account." };
  const targetIsDirector = (current.roles ?? []).includes(DIRECTOR);
  const v = await validateDraft({ ...draft, email: current.email }, id);
  if (Object.keys(v.errors).length) return { ok: false, errors: v.errors, error: "Some details need fixing." };
  const lock = directorLockReason({ isDirector: targetIsDirector }, false);
  if (lock) return { ok: false, error: lock };
  if (!targetIsDirector && (v.refusal || !v.check)) return { ok: false, error: v.refusal ?? "This access cannot be saved." };
  const blocked = await delegatedManagerBlock(actor, { targetId: id, roles: targetIsDirector ? undefined : v.check?.roles, overrides: targetIsDirector ? false : Object.keys(v.check?.overrides ?? {}).length > 0, access: targetIsDirector ? undefined : v.check?.access });
  if (blocked) return { ok: false, error: blocked };
  const org = await orgLookup();
  const p = plan(v, org);
  const d = v.details;
  const before = current.access ? countFeatures(current.access) : null;
  const res = await updatePersonAccount(id, {
    name: d.name, phone: d.phone, joiningDate: d.joiningDate, userType: d.userType, departmentIds: d.departmentIds, teamIds: d.teamIds, designationIds: d.designationIds,
    designationTitle: p.designationTitle, departmentName: p.departmentName,
    ...(targetIsDirector || !v.check ? {} : { access: v.check.access, roles: v.check.roles, overrides: v.check.overrides }),
  }, actor.id);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAccessAudit({
    actorId: actor.id, action: "user.access_changed", target: current.email,
    detail: targetIsDirector ? "details only (Director)" : `${v.check?.products ?? 0} product(s); features ${before ?? "from older roles"} -> ${v.check ? countFeatures(v.check.access) : 0}`,
  });
  return { ok: true, id, withheld: v.check?.withheld };
}

export interface PersonForEdit {
  id: string;
  isDirector: boolean;
  details: PersonDetails;
  picked: AccessMap;
  /** True when the person came from older roles (nothing was saved from this screen yet). */
  fromLegacyRoles: boolean;
  status: string;
}

/** Loads a person into the same 3 steps. People who have no saved access map get one derived from their older roles, so nothing has to be migrated first. */
export async function loadPersonForEdit(id: string): Promise<PersonForEdit | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const u = await db.collection<AdminUserDoc>(ADMIN_USERS_COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!u) return null;
  const emp = u.employeeId ? await db.collection<{ professional?: { departmentId?: string | null; teamId?: string | null; designationId?: string | null; joiningDate?: string | null }; personal?: { phone?: string | null } }>("hrms_employees").findOne({ _id: u.employeeId as never }) : null;
  const isDirector = (u.roles ?? []).includes(DIRECTOR);
  const one = (x?: string | null) => (x ? [x] : []);
  const details: PersonDetails = {
    name: u.name ?? "", email: u.email, phone: u.phone ?? emp?.personal?.phone ?? "", joiningDate: emp?.professional?.joiningDate ?? "",
    userType: u.userType ?? "employee",
    departmentIds: u.departmentIds ?? one(emp?.professional?.departmentId), teamIds: u.teamIds ?? one(emp?.professional?.teamId),
    designationIds: u.designationIds ?? (isDirector ? [] : one(u.designationId && u.designationId !== DIRECTOR_DESIGNATION_ID ? u.designationId : emp?.professional?.designationId)),
    invite: "password",
  };
  const fromLegacyRoles = !u.access;
  const picked = isDirector ? {} : u.access ? splitPicked(u.access) : prefillFromLegacy({ roles: u.roles ?? [], permissionOverrides: u.permissionOverrides }).picked;
  return { id, isDirector, details, picked, fromLegacyRoles, status: u.status ?? "active" };
}

export { completeWith, buildAccessUi };
