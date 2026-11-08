import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { hashPassword } from "@/lib/lms-auth";
import { newAccountBlockReason, rollbackIfOverSeats, rolesUseSeat, seatBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Director management of the shared `admin_users` collection — the
 * identity store every internal product (HRMS/PMS/PRMS/TMS/Team Chat/LMS/Admin)
 * reads its login and `roles` array from. There is no existing in-app
 * surface for this anywhere: role grants are currently CLI-only
 * (`scripts/grant-*-role.mjs`). This is the first — treat it carefully:
 * every write here changes who can access what, across the whole ERP.
 */

import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { computeEffective, effectiveUpdate, getCustomRoles, resolveAssignableIds } from "@/lib/products/commandos/custom-roles";
import { type AdminUserRow, type PanelAccessSummaryItem, getPanelAccessSummary } from "@/lib/products/commandos/admin-users-shared";
import { BLOCKED_STATUSES, LEFT_STATUSES, canSignIn, statusOf, type AccountStatus } from "@/lib/security/account-status";
import { DIRECTOR_ROLE, DIRECTOR_TITLE } from "@/lib/platform/designations";
import { ensureDesignations } from "@/lib/products/commandos/custom-roles";
import { ensureHrFile, syncHrDesignation, type HrFileInput } from "@/lib/products/commandos/employee-link";

export type { AdminUserRow, PanelAccessSummaryItem };
export { getPanelAccessSummary };

export const ADMIN_USERS_COLLECTION = "admin_users";
const SCRYPT_TEMP_PASSWORD_LENGTH = 12;

export interface AdminUserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  roles?: string[];
  /**
   * Per-capability overrides on top of `roles`, keyed `"<module>.<predicateName>"`
   * (e.g. `"pms.canManageProjects"`) — see `src/lib/permission-overrides.ts`.
   * `true` = explicit grant, `false` = explicit deny, key absent = default
   * role-based behavior. Inert on any account holding `super_admin`.
   */
  permissionOverrides?: Record<string, boolean>;
  employeeId?: string | null;
  mustChangePassword?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
  createdAt: Date;
  lastLoginAt?: Date | null;
  savedRoles?: string[];
  /** Inputs of the computed `roles` / `permissionOverrides` — see `custom-roles.ts`. */
  manualRoles?: string[];
  manualOverrides?: Record<string, boolean>;
  customRoleIds?: string[];
  userType?: "employee" | "contractor" | "partner" | "system";
  notes?: string;
  name?: string;
  /** The person's designation: the id of a designation (a custom role), or `"director"` for the company's top role. */
  designationId?: string | null;
  status?: AccountStatus;
  statusReason?: string;
  statusChangedAt?: Date;
  statusChangedBy?: string;
  lastWorkingDay?: string;
}

export const DIRECTOR_DESIGNATION_ID = "director";

/** An account switched off the old way (no roles, no status) must stay switched off when its roles are edited: give it the status explicitly. */
function pinLegacyStatus(u: { status?: string; roles?: string[] }): { status?: AccountStatus } {
  return !u.status && (u.roles ?? []).length === 0 ? { status: "deactivated" } : {};
}

function serialize(u: AdminUserDoc, designations: ReadonlyMap<string, string> = new Map()): AdminUserRow {
  const roles = u.roles ?? [];
  return {
    _id: u._id.toString(),
    email: u.email,
    roles,
    permissionOverrides: u.permissionOverrides ?? {},
    customRoleIds: u.customRoleIds ?? [],
    manualRoles: u.manualRoles ?? ((u.customRoleIds ?? []).length === 0 ? roles : []),
    manualOverrides: u.manualOverrides ?? ((u.customRoleIds ?? []).length === 0 ? u.permissionOverrides ?? {} : {}),
    employeeId: u.employeeId ?? null,
    mustChangePassword: u.mustChangePassword === true,
    locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    status: statusOf(u),
    statusReason: u.statusReason ?? "",
    statusChangedAt: u.statusChangedAt ? u.statusChangedAt.toISOString() : null,
    lastWorkingDay: u.lastWorkingDay ?? null,
    name: u.name ?? "",
    designation: roles.includes(DIRECTOR_ROLE) ? DIRECTOR_TITLE : (u.designationId ? designations.get(u.designationId) : undefined) ?? ((u.customRoleIds ?? []).map((id) => designations.get(id)).find(Boolean) ?? "—"),
    designationId: roles.includes(DIRECTOR_ROLE) ? DIRECTOR_DESIGNATION_ID : u.designationId ?? null,
    savedRoles: u.savedRoles ?? [],
    userType: u.userType ?? "employee",
    notes: u.notes ?? "",
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<AdminUserDoc>(ADMIN_USERS_COLLECTION);
}

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url").slice(0, SCRYPT_TEMP_PASSWORD_LENGTH);
}

export type StatusFilter = AccountStatus | "working" | "blocked" | "left" | "active_any";

export interface AdminUserFilter {
  search?: string;
  role?: string;
  panel?: string;
  /** One status, or a group: `working` (can sign in), `blocked` (cannot sign in), `left` (left the company). */
  status?: StatusFilter;
  designationId?: string;
  userType?: "employee" | "contractor" | "partner" | "system";
}

function getRolesForPanel(panel: string): string[] {
  const p = panel.toLowerCase();
  if (p === "admin") return ["super_admin"];
  // OTS access is also implied by HRMS employee/hr and TMS roles (see `ots-roles.ts`).
  const extra = p === "ots" ? ["employee", "hr", "training_student", "tms_admin", "tms_manager", "mentor"] : [];
  // Derived from the role catalog (the roles each product really checks) so a product can never be left out of the filter.
  const group = ROLE_GROUPS.find((g) => g.panel === p);
  return group ? ["super_admin", ...group.roles.map((r) => r.value), ...extra] : ["super_admin"];
}

function buildFilter(opts: AdminUserFilter): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    and.push({ $or: [{ email: rx }, { name: rx }, { notes: rx }, { employeeId: rx }] });
  }

  if (opts.role) {
    and.push({ roles: opts.role });
  } else if (opts.panel && opts.panel !== "all") {
    const panelRoles = getRolesForPanel(opts.panel);
    if (opts.panel === "lms" || opts.panel === "workspace") {
      and.push({ roles: { $exists: true, $not: { $size: 0 } } });
    } else {
      and.push({ roles: { $in: panelRoles } });
    }
  }

  // Accounts from before statuses existed have none: no roles = deactivated, anything else = active.
  const noRoles = { $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] };
  const legacy = { status: { $exists: false } };
  const hasRoles = { roles: { $exists: true, $not: { $size: 0 } } };
  if (opts.status === "working") {
    and.push({ $or: [{ status: { $exists: true, $nin: BLOCKED_STATUSES } }, { ...legacy, ...hasRoles }] });
  } else if (opts.status === "blocked") {
    and.push({ $or: [{ status: { $in: BLOCKED_STATUSES } }, { $and: [legacy, noRoles] }] });
  } else if (opts.status === "left") {
    and.push({ status: { $in: LEFT_STATUSES } });
  } else if (opts.status === "active") {
    and.push({ $or: [{ status: "active" }, { ...legacy, ...hasRoles }] });
  } else if (opts.status === "deactivated") {
    and.push({ $or: [{ status: "deactivated" }, { $and: [legacy, noRoles] }] });
  } else if (opts.status) {
    and.push({ status: opts.status });
  }

  if (opts.designationId) {
    and.push(opts.designationId === DIRECTOR_DESIGNATION_ID ? { roles: DIRECTOR_ROLE } : { $or: [{ designationId: opts.designationId }, { customRoleIds: opts.designationId }] });
  }

  if (opts.userType) {
    and.push(opts.userType === "employee" ? { $or: [{ userType: "employee" }, { userType: { $exists: false } }] } : { userType: opts.userType });
  }

  return and.length > 0 ? { $and: and } : {};
}

export interface SearchAdminUsersOptions extends AdminUserFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "email" | "lastLoginAt";
  sortDir?: "asc" | "desc";
}

export async function searchAdminUsers(opts: SearchAdminUsersOptions = {}) {
  const col = await collection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [docs, total, activeCount, deactivatedCount, leftCount, names] = await Promise.all([
    col.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col.countDocuments(filter),
    col.countDocuments(buildFilter({ status: "working" })),
    col.countDocuments(buildFilter({ status: "blocked" })),
    col.countDocuments(buildFilter({ status: "left" })),
    designationNames(),
  ]);

  return {
    items: docs.map((d) => serialize(d, names)),
    total,
    /** People who can sign in. */
    activeCount,
    /** People who cannot sign in right now (suspended, deactivated or left). */
    deactivatedCount,
    leftCount,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

/** Designation id → title, for showing what each person holds. */
async function designationNames(): Promise<Map<string, string>> {
  await ensureDesignations();
  const rows = await (await getDb()).collection<{ _id: string; name: string }>("custom_roles").find({}, { projection: { name: 1 } }).toArray();
  return new Map(rows.map((r) => [r._id, r.name]));
}

export async function exportAdminUsers(opts: AdminUserFilter & { ids?: string[] } = {}): Promise<AdminUserRow[]> {
  const col = await collection();
  const filter =
    opts.ids && opts.ids.length > 0
      ? { _id: { $in: opts.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } }
      : buildFilter(opts);
  const docs = await col.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
  const names = await designationNames();
  return docs.map((d) => serialize(d, names));
}

export async function getAdminUserRow(id: string): Promise<AdminUserRow | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? serialize(doc, await designationNames()) : null;
}

/**
 * Limits for someone who manages users through the `workspace.manageUsers`
 * permission without being a Director: they can't hand out `super_admin`,
 * can't change a Director's account, and can't edit permission overrides
 * (any of which would let them raise their own access). Returns the reason,
 * or null when the action is allowed. Directors are never limited.
 */
export async function delegatedManagerBlock(
  actor: { id?: string; roles: readonly string[] },
  action: { targetId?: string; roles?: readonly string[]; overrides?: boolean }
): Promise<string | null> {
  if (actor.roles.includes(DIRECTOR_ROLE)) return null;
  // Nobody raises their own access: a delegated manager can't change their own account's roles or permissions.
  if (actor.id && action.targetId && action.targetId === actor.id && (action.roles || action.overrides)) return "You can't change your own access.";
  if (action.roles?.includes("super_admin")) return "Only a Director can make someone a Director.";
  // An admin-tier role can only be handed on by someone who holds it themselves.
  const escalating = (action.roles ?? []).filter((r) => /_admin$/.test(r) && !actor.roles.includes(r));
  if (escalating.length > 0) return "You can only grant an admin role that you hold yourself.";
  if (action.overrides) return "Only a Director can change permission overrides.";
  if (action.targetId) {
    const target = ObjectId.isValid(action.targetId) ? await (await collection()).findOne({ _id: new ObjectId(action.targetId) }, { projection: { roles: 1, savedRoles: 1 } }) : null;
    if (target?.roles?.includes("super_admin") || target?.savedRoles?.includes("super_admin")) return "Only a Director can change a Director's account.";
  }
  return null;
}

export interface CreateAdminUserResult {
  ok: boolean;
  error?: string;
  id?: string;
  tempPassword?: string;
  /** The TalentOS HR file made for the person, when it could be. */
  employeeId?: string;
  /** Why the HR file was not made (the account itself was). */
  hrWarning?: string;
}

export interface CreateAdminUserInput {
  email: string;
  /** Full name: shown in the people list and used for the HR file. */
  name: string;
  /** A designation (the id of a custom role) or `"director"`. It decides the access the person gets in every product. */
  designationId: string;
  /** Extra built-in product roles on top of the designation. */
  extraRoles?: string[];
  /** Extra designations / custom roles on top of the primary one. */
  extraCustomRoleIds?: string[];
  /** Individual permissions on top of the designation: true = always allow, false = always deny. Director only (checked by the caller). */
  extraOverrides?: Record<string, boolean>;
  userType?: "employee" | "contractor" | "partner" | "system";
  notes?: string;
  hr?: Pick<HrFileInput, "departmentId" | "reportingManagerId" | "employmentType" | "joiningDate" | "phone">;
}

/** The roles and custom roles a designation (plus extras) stands for. */
async function accessFor(designationId: string, extraRoles: string[], extraIds: string[]): Promise<{ ok: true; manualRoles: string[]; customRoleIds: string[]; title: string; department: string | null } | { ok: false; error: string }> {
  if (designationId === DIRECTOR_DESIGNATION_ID) return { ok: true, manualRoles: [...new Set([DIRECTOR_ROLE, ...extraRoles])], customRoleIds: [], title: DIRECTOR_TITLE, department: "Management" };
  await ensureDesignations();
  const assigned = await resolveAssignableIds([designationId, ...extraIds.filter((x) => x !== designationId)]);
  if (!assigned.ok) return { ok: false, error: assigned.error.replace("custom roles", "designations").replace("custom role", "designation") };
  const [primary] = await getCustomRoles([designationId]);
  if (!primary) return { ok: false, error: "Choose a designation." };
  return { ok: true, manualRoles: extraRoles, customRoleIds: assigned.ids, title: primary.name, department: primary.department === "Custom" ? null : primary.department };
}

export async function createAdminUser(input: CreateAdminUserInput, actorId: string): Promise<CreateAdminUserResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { ok: false, error: "Enter a valid email address." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || /[<>]/.test(name)) return { ok: false, error: "Enter the person's full name (2–80 characters)." };
  if (!input.designationId) return { ok: false, error: "Choose a designation." };

  const col = await collection();
  const existing = await col.findOne({ email: normalizedEmail });
  if (existing) return { ok: false, error: "An account with this email already exists." };
  const access = await accessFor(input.designationId, input.extraRoles ?? [], input.extraCustomRoleIds ?? []);
  if (!access.ok) return access;
  const custom = await getCustomRoles(access.customRoleIds);
  const eff = computeEffective(access.manualRoles, input.extraOverrides ?? {}, custom);
  if (eff.roles.length === 0) return { ok: false, error: "Choose a designation." };
  const seatBlock = await newAccountBlockReason(eff.roles);
  if (seatBlock) return { ok: false, error: seatBlock };

  const tempPassword = generateTempPassword();
  const now = new Date();
  const doc: AdminUserDoc = {
    _id: new ObjectId(),
    email: normalizedEmail,
    name,
    passwordHash: hashPassword(tempPassword),
    roles: eff.roles,
    permissionOverrides: eff.overrides,
    manualRoles: access.manualRoles,
    manualOverrides: input.extraOverrides ?? {},
    customRoleIds: access.customRoleIds,
    designationId: input.designationId,
    status: "active",
    userType: input.userType ?? "employee",
    notes: input.notes?.trim() || undefined,
    employeeId: null,
    mustChangePassword: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    lastLoginAt: null,
  };
  await col.insertOne(doc);
  const rolledBack = await rollbackIfOverSeats(doc._id);
  if (rolledBack) return { ok: false, error: rolledBack };

  // The person's HR file in TalentOS: they complete the rest of their profile there.
  const hr = await ensureHrFile({ userId: doc._id, email: normalizedEmail, name, designationTitle: access.title, departmentName: access.department, actorId, ...(input.hr ?? {}) });
  return { ok: true, id: doc._id.toString(), tempPassword, ...(hr.ok ? { employeeId: hr.employeeId } : { hrWarning: hr.error }) };
}

/**
 * Gives someone another designation. Their access in every product is recalculated from it (plus any extras they keep), their HR file
 * shows the new designation, and the change is written to the access audit log by the caller.
 */
export async function changeDesignation(id: string, designationId: string, actorId: string): Promise<{ ok: boolean; error?: string; title?: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  const col = await collection();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) return { ok: false, error: "Unknown account." };
  const wasDirector = (current.roles ?? []).includes(DIRECTOR_ROLE);
  const willBeDirector = designationId === DIRECTOR_DESIGNATION_ID;
  if (id === actorId && wasDirector && !willBeDirector) return { ok: false, error: "You can't take your own Director designation away. Ask another Director." };
  if (wasDirector && !willBeDirector && canSignIn(current)) {
    const others = (await col.find({ roles: DIRECTOR_ROLE, _id: { $ne: current._id } }, { projection: { roles: 1, status: 1 } }).toArray()).filter((u) => canSignIn(u)).length;
    if (others < 1) return { ok: false, error: "A company needs at least one Director who can sign in. Make someone else a Director first." };
  }
  const keepIds = (current.customRoleIds ?? []).filter((x) => x !== current.designationId && x !== designationId);
  const keepRoles = (current.manualRoles ?? []).filter((r) => r !== DIRECTOR_ROLE);
  const access = await accessFor(designationId, keepRoles, keepIds);
  if (!access.ok) return access;
  const custom = await getCustomRoles(access.customRoleIds);
  const eff = computeEffective(access.manualRoles, current.manualOverrides ?? {}, custom);
  if (!rolesUseSeat(current.roles) && rolesUseSeat(eff.roles) && canSignIn(current)) {
    const seatBlock = await seatBlockReason(1);
    if (seatBlock) return { ok: false, error: seatBlock };
  }
  await col.updateOne({ _id: current._id }, { $set: { designationId, roles: eff.roles, permissionOverrides: eff.overrides, manualRoles: access.manualRoles, customRoleIds: access.customRoleIds, updatedAt: new Date(), ...pinLegacyStatus(current) } as never });
  await syncHrDesignation(current._id, access.title, actorId);
  return { ok: true, title: access.title };
}

/**
 * `actorId` is always the calling Director's own id, checked here so a
 * Director can never strip their own Director role through this UI, and the
 * last Director who can sign in can never lose it — the one way to lock a
 * company out of its own management for good.
 */
export async function updateAdminUserRoles(
  id: string,
  roles: string[],
  actorId: string,
  customRoleIds?: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  if (id === actorId && !roles.includes("super_admin")) {
    return { ok: false, error: "You can't remove your own Director role." };
  }
  const col = await collection();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) return { ok: false, error: "Unknown account." };
  if ((current.roles ?? []).includes("super_admin") && !roles.includes("super_admin") && canSignIn(current)) {
    const others = (await col.find({ roles: "super_admin", _id: { $ne: current._id } }, { projection: { roles: 1, status: 1 } }).toArray()).filter((u) => canSignIn(u)).length;
    if (others < 1) return { ok: false, error: "A company needs at least one Director who can sign in. Make someone else a Director first." };
  }
  let ids = current.customRoleIds ?? [];
  if (customRoleIds) {
    const assigned = await resolveAssignableIds(customRoleIds);
    if (!assigned.ok) return { ok: false, error: assigned.error };
    ids = assigned.ids;
  }
  // The person's own designation stays: it is changed with "Change designation", not by unticking it here.
  if (current.designationId && current.designationId !== DIRECTOR_DESIGNATION_ID && !ids.includes(current.designationId)) ids = [current.designationId, ...ids];
  const update = await effectiveUpdate(current, { manualRoles: roles, customRoleIds: ids });
  const effective = (update.roles as string[] | undefined) ?? [];
  if (effective.length > 0 && !rolesUseSeat(current.roles) && rolesUseSeat(effective)) {
    const seatBlock = await seatBlockReason(1);
    if (seatBlock) return { ok: false, error: seatBlock };
  }
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: { ...update, ...pinLegacyStatus(current) } });
  return { ok: res.matchedCount === 1 };
}

/**
 * Full-replace write for `permissionOverrides`, mirroring `updateAdminUserRoles`'s
 * shape. Key validation against the known permission catalog happens one layer
 * up, in the admin server action (same "filter against the known-good list"
 * precedent `sanitizeRoles()` uses for roles) — this function trusts its input.
 * No self-protection guard is needed here: overrides are inert on any account
 * holding `super_admin` (see `resolvePermission` in `permission-overrides.ts`),
 * so a super_admin can never lock themselves — or another super_admin — out via
 * a bad override.
 */
export async function updateAdminUserPermissionOverrides(
  id: string,
  overrides: Record<string, boolean>
): Promise<{ ok: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  const col = await collection();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) return { ok: false, error: "Unknown account." };
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: await effectiveUpdate(current, { manualOverrides: overrides }) });
  return { ok: res.matchedCount === 1 };
}

export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
  tempPassword?: string;
}

export async function resetAdminUserPassword(id: string): Promise<ResetPasswordResult> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  const col = await collection();
  const tempPassword = generateTempPassword();
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        passwordHash: hashPassword(tempPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }
  );
  if (res.matchedCount !== 1) return { ok: false, error: "Unknown account." };
  return { ok: true, tempPassword };
}

export async function setUserTypeAndNotes(
  id: string,
  userType: "employee" | "contractor" | "partner" | "system",
  notes?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Unknown account." };
  const col = await collection();
  const updatePayload: Record<string, unknown> = { userType };
  if (notes !== undefined) {
    updatePayload.notes = notes.trim();
  }
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: updatePayload });
  return { ok: res.matchedCount === 1 };
}
