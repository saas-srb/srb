import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { ALL_KNOWN_ROLES } from "@/lib/products/commandos/role-catalog";
import { ALL_PERMISSION_KEYS } from "@/lib/products/commandos/permission-catalog";
import type { CustomRoleInput, CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import { DESIGNATION_TEMPLATES } from "@/lib/platform/designations";
import { MAX_CUSTOM_ROLES, MAX_ROLES_PER_USER, validateCustomRoleInput } from "@/lib/products/commandos/custom-roles-shared";

/**
 * Custom roles: a company-defined bundle of built-in product roles (which products the person can open and what each role
 * allows by default) plus individual permission grants / denials from the permission catalog.
 *
 * Every product already decides access from `admin_users.roles` and `admin_users.permissionOverrides`, so a custom role is
 * MATERIALISED into those two fields — no product needs to know custom roles exist, and none can be missed:
 *   roles                = manual built-in roles ∪ the base roles of every assigned custom role
 *   permissionOverrides  = custom-role permissions (a deny from any role beats a grant), then the Director's manual overrides on top
 * `manualRoles` / `manualOverrides` / `customRoleIds` are the inputs; `roles` / `permissionOverrides` are the computed result,
 * rewritten whenever an input or a custom role changes.
 *
 * Safety: custom roles can never contain `super_admin`; only a Director creates, edits, deletes or hands out a custom
 * role that carries permission grants (a delegated user manager may assign plain role bundles they could grant themselves).
 * Every change is written to the access audit log.
 */

export const CUSTOM_ROLES_COLLECTION = "custom_roles";
export const ACCESS_AUDIT_COLLECTION = "access_audit_log";

export interface CustomRoleDoc {
  _id: string;
  name: string;
  nameKey: string;
  description: string;
  baseRoles: string[];
  permissions: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  /** Created by the platform for every company (see `platform/designations.ts`); recognised by this key even if renamed. */
  builtinKey?: string;
  department?: string;
}

interface AccessUserDoc {
  _id: ObjectId;
  email: string;
  roles?: string[];
  permissionOverrides?: Record<string, boolean>;
  manualRoles?: string[];
  manualOverrides?: Record<string, boolean>;
  customRoleIds?: string[];
  savedRoles?: string[];
  designationId?: string | null;
  status?: string;
}

async function rolesCol(): Promise<Collection<CustomRoleDoc>> {
  const col = (await getDb()).collection<CustomRoleDoc>(CUSTOM_ROLES_COLLECTION);
  await col.createIndex({ nameKey: 1 }, { unique: true }).catch(() => {});
  return col;
}

async function usersCol(): Promise<Collection<AccessUserDoc>> {
  return (await getDb()).collection<AccessUserDoc>("admin_users");
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

function view(d: CustomRoleDoc, userCount = 0): CustomRoleView {
  return { id: d._id, name: d.name, description: d.description, baseRoles: d.baseRoles, permissions: d.permissions, userCount, updatedAt: d.updatedAt.toISOString(), builtinKey: d.builtinKey ?? null, department: d.department ?? "Custom" };
}

// ── audit ───────────────────────────────────────────────────────────────────

export interface AccessAuditRow {
  id: string;
  at: string;
  actorEmail: string | null;
  action: string;
  target: string;
  detail: string;
}

export async function recordAccessAudit(e: { actorId: string; action: string; target: string; detail?: string }): Promise<void> {
  try {
    const db = await getDb();
    const actor = ObjectId.isValid(e.actorId) ? await db.collection<{ email: string }>("admin_users").findOne({ _id: new ObjectId(e.actorId) as never }, { projection: { email: 1 } }) : null;
    await db.collection(ACCESS_AUDIT_COLLECTION).insertOne({ at: new Date(), actorId: e.actorId, actorEmail: actor?.email ?? null, action: e.action, target: e.target.slice(0, 200), detail: (e.detail ?? "").slice(0, 600) } as never);
  } catch (err) {
    console.error("[access-audit] could not record", err); // an audit hiccup must not undo the change itself
  }
}

export async function listAccessAudit(limit = 100): Promise<AccessAuditRow[]> {
  const rows = await (await getDb()).collection(ACCESS_AUDIT_COLLECTION).find({}).sort({ at: -1 }).limit(Math.min(limit, 500)).toArray();
  return rows.map((r) => ({ id: String(r._id), at: new Date(r.at as Date).toISOString(), actorEmail: (r.actorEmail as string | null) ?? null, action: String(r.action), target: String(r.target), detail: String(r.detail ?? "") }));
}

// ── pure computation ────────────────────────────────────────────────────────

export function computeEffective(manualRoles: readonly string[], manualOverrides: Record<string, boolean>, custom: readonly Pick<CustomRoleDoc, "baseRoles" | "permissions">[]): { roles: string[]; overrides: Record<string, boolean> } {
  const roles = new Set<string>(manualRoles);
  for (const r of custom) for (const b of r.baseRoles) roles.add(b);
  const fromRoles: Record<string, boolean> = {};
  for (const r of custom) {
    for (const [k, v] of Object.entries(r.permissions)) {
      if (v === false) fromRoles[k] = false; // a deny from any role wins over grants from the others
      else if (fromRoles[k] !== false) fromRoles[k] = true;
    }
  }
  return { roles: [...roles], overrides: { ...fromRoles, ...manualOverrides } };
}

function inputsOf(u: AccessUserDoc): { manualRoles: string[]; manualOverrides: Record<string, boolean>; customRoleIds: string[] } {
  const customRoleIds = u.customRoleIds ?? [];
  return {
    manualRoles: u.manualRoles ?? (customRoleIds.length === 0 ? u.roles ?? [] : []),
    manualOverrides: u.manualOverrides ?? (customRoleIds.length === 0 ? u.permissionOverrides ?? {} : {}),
    customRoleIds,
  };
}

async function rolesById(ids: readonly string[]): Promise<CustomRoleDoc[]> {
  if (ids.length === 0) return [];
  return (await rolesCol()).find({ _id: { $in: [...ids] } }).toArray();
}

/** The `$set` that makes a user's `roles` / `permissionOverrides` match their inputs. Deactivated accounts (no roles) keep none; the result waits in `savedRoles`. */
export async function effectiveUpdate(u: AccessUserDoc, patch: { manualRoles?: string[]; manualOverrides?: Record<string, boolean>; customRoleIds?: string[] } = {}): Promise<Record<string, unknown>> {
  const base = inputsOf(u);
  const manualRoles = patch.manualRoles ?? base.manualRoles;
  const manualOverrides = patch.manualOverrides ?? base.manualOverrides;
  const customRoleIds = patch.customRoleIds ?? base.customRoleIds;
  const found = await rolesById(customRoleIds);
  const eff = computeEffective(manualRoles, manualOverrides, found);
  const deactivated = (u.roles ?? []).length === 0 && !patch.manualRoles && !patch.customRoleIds;
  return {
    manualRoles,
    manualOverrides,
    customRoleIds: found.map((r) => r._id),
    permissionOverrides: eff.overrides,
    ...(deactivated ? { savedRoles: eff.roles } : { roles: eff.roles }),
  };
}

// ── queries ─────────────────────────────────────────────────────────────────

export async function listCustomRoles(): Promise<CustomRoleView[]> {
  const [docs, counts] = await Promise.all([
    (await rolesCol()).find({}).sort({ nameKey: 1 }).toArray(),
    (await usersCol()).aggregate<{ _id: string; n: number }>([{ $unwind: "$customRoleIds" }, { $group: { _id: "$customRoleIds", n: { $sum: 1 } } }]).toArray(),
  ]);
  const byId = new Map(counts.map((c) => [c._id, c.n]));
  return docs.map((d) => view(d, byId.get(d._id) ?? 0));
}

export async function getCustomRoles(ids: readonly string[]): Promise<CustomRoleView[]> {
  return (await rolesById(ids)).map((d) => view(d));
}

/** Whether any of these roles carries permission grants / denials (those can only be handed out by a Director). */
export async function customRolesCarryPermissions(ids: readonly string[]): Promise<boolean> {
  return (await rolesById(ids)).some((r) => Object.keys(r.permissions).length > 0);
}

// ── the built-in designations ───────────────────────────────────────────────

const seeded = new Map<string, number>();

/**
 * Makes sure the company has every built-in designation (`platform/designations.ts`), as normal custom roles. Created once, then left
 * alone: a renamed or edited one stays as the Director made it, a deleted-by-hand one is not brought back (they can't be deleted here).
 * Cheap to call: it is remembered for a few minutes.
 */
export async function ensureDesignations(): Promise<void> {
  const companyId = await (await import("@/lib/platform/tenancy/context")).currentCompanyId();
  if (Date.now() - (seeded.get(companyId) ?? 0) < 5 * 60_000) return;
  const col = await rolesCol();
  const have = new Set((await col.find({ builtinKey: { $exists: true } }, { projection: { builtinKey: 1 } }).toArray()).map((d) => d.builtinKey));
  const now = new Date();
  const names = new Set((await col.find({}, { projection: { nameKey: 1 } }).toArray()).map((d) => d.nameKey));
  const docs: CustomRoleDoc[] = [];
  for (const t of DESIGNATION_TEMPLATES) {
    if (have.has(t.key)) continue;
    let title = t.title;
    if (names.has(title.toLowerCase())) title = `${t.title} (standard)`; // the company already made a role with this name
    names.add(title.toLowerCase());
    docs.push({ _id: randomUUID(), name: title, nameKey: title.toLowerCase(), description: t.description, baseRoles: t.roles, permissions: {}, createdAt: now, updatedAt: now, createdBy: "platform", updatedBy: "platform", builtinKey: t.key, department: t.department });
  }
  if (docs.length > 0) {
    try {
      // One write for all of them; a name that was taken a moment ago by someone else is skipped, not fatal.
      await col.insertMany(docs, { ordered: false });
    } catch (err) {
      const code = (err as { code?: number; writeErrors?: { code?: number }[] }).code;
      const onlyDuplicates = code === 11000 || ((err as { writeErrors?: { code?: number }[] }).writeErrors ?? []).every((w) => w.code === 11000);
      if (!onlyDuplicates) throw err;
    }
  }
  seeded.set(companyId, Date.now());
}

// ── create / update / delete ────────────────────────────────────────────────

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function clean(input: CustomRoleInput): { ok: true; value: CustomRoleInput } | { ok: false; error: string } {
  const v = validateCustomRoleInput(input, { knownRoles: ALL_KNOWN_ROLES.filter((r) => r !== "super_admin"), knownPermissions: ALL_PERMISSION_KEYS });
  return v.ok ? { ok: true, value: v.value } : { ok: false, error: v.error };
}

export async function createCustomRole(input: CustomRoleInput, actorId: string): Promise<Result<{ id: string }>> {
  const v = clean(input);
  if (!v.ok) return v;
  const col = await rolesCol();
  if ((await col.countDocuments({})) >= MAX_CUSTOM_ROLES) return { ok: false, error: `A company can have at most ${MAX_CUSTOM_ROLES} custom roles.` };
  const now = new Date();
  const doc: CustomRoleDoc = { _id: randomUUID(), name: norm(v.value.name), nameKey: norm(v.value.name).toLowerCase(), description: v.value.description.trim(), baseRoles: v.value.baseRoles, permissions: v.value.permissions, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, error: "A custom role with that name already exists." };
    throw err;
  }
  await recordAccessAudit({ actorId, action: "role.created", target: doc.name, detail: `${doc.baseRoles.length} base role(s), ${Object.keys(doc.permissions).length} permission rule(s)` });
  return { ok: true, id: doc._id };
}

export async function updateCustomRole(id: string, input: CustomRoleInput, actorId: string): Promise<Result<{ affected: number }>> {
  const v = clean(input);
  if (!v.ok) return v;
  const col = await rolesCol();
  const before = await col.findOne({ _id: id });
  if (!before) return { ok: false, error: "That custom role no longer exists." };
  try {
    await col.updateOne({ _id: id }, { $set: { name: norm(v.value.name), nameKey: norm(v.value.name).toLowerCase(), description: v.value.description.trim(), baseRoles: v.value.baseRoles, permissions: v.value.permissions, updatedAt: new Date(), updatedBy: actorId } });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, error: "A custom role with that name already exists." };
    throw err;
  }
  const affected = await resyncUsersOf(id);
  const diff = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  await recordAccessAudit({ actorId, action: "role.updated", target: norm(v.value.name), detail: `roles +[${diff(v.value.baseRoles, before.baseRoles).join(", ")}] -[${diff(before.baseRoles, v.value.baseRoles).join(", ")}]; permissions ${Object.keys(before.permissions).length}→${Object.keys(v.value.permissions).length}; ${affected} user(s) updated` });
  return { ok: true, affected };
}

export async function deleteCustomRole(id: string, actorId: string): Promise<Result<{ affected: number }>> {
  const col = await rolesCol();
  const role = await col.findOne({ _id: id });
  if (!role) return { ok: false, error: "That custom role no longer exists." };
  if (role.builtinKey) return { ok: false, error: "This is one of the standard designations, so it can't be deleted. You can edit it, or simply not use it." };
  const holdersAsDesignation = await (await usersCol()).countDocuments({ designationId: id });
  if (holdersAsDesignation > 0) return { ok: false, error: `${holdersAsDesignation} ${holdersAsDesignation === 1 ? "person holds" : "people hold"} this as their designation. Give them another designation first.` };
  // Take it off everyone first, so nobody keeps access that came only from it.
  const users = await usersCol();
  const holders = await users.find({ customRoleIds: id }).toArray();
  await col.deleteOne({ _id: id });
  for (const u of holders) {
    const next = (u.customRoleIds ?? []).filter((x) => x !== id);
    await users.updateOne({ _id: u._id }, { $set: await effectiveUpdate(u, { customRoleIds: next }) });
  }
  await recordAccessAudit({ actorId, action: "role.deleted", target: role.name, detail: `${holders.length} user(s) lost it` });
  return { ok: true, affected: holders.length };
}

/** Rewrites every holder's `roles` / `permissionOverrides` after the role changed. */
export async function resyncUsersOf(roleId: string): Promise<number> {
  const users = await usersCol();
  const holders = await users.find({ customRoleIds: roleId }).toArray();
  for (const u of holders) await users.updateOne({ _id: u._id }, { $set: await effectiveUpdate(u) });
  return holders.length;
}

/** Validates ids against the company's roles; unknown ids are an error (never silently dropped). */
export async function resolveAssignableIds(ids: readonly string[]): Promise<Result<{ ids: string[] }>> {
  const unique = [...new Set(ids.map(String))];
  if (unique.length > MAX_ROLES_PER_USER) return { ok: false, error: `A person can hold at most ${MAX_ROLES_PER_USER} custom roles.` };
  const found = await rolesById(unique);
  if (found.length !== unique.length) return { ok: false, error: "One of the selected custom roles no longer exists." };
  return { ok: true, ids: unique };
}
