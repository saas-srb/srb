import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { ALL_PERMISSIONS, VIEWER_PERMISSIONS, coversPermissions, hasPermission, isPlatformPermission, type PlatformPermission } from "./permissions";

/**
 * Platform roles & platform users.
 *
 * Roles live in `platform_roles` (global). Four built-ins are seeded on first
 * use and can't be edited or deleted; their permissions come from this file,
 * so a new permission reaches them without a migration.
 *
 * WHO is a platform user is stored on the owner company's own `admin_users`
 * doc (company-scoped — read through `getDb()` on the owner's host):
 *   - `platformRoleId`    — the assigned role (null/absent = none assigned)
 *   - `platformRevokedAt` — set when access is revoked; blocks the legacy
 *                           fallback below
 *   - `platformGrantedAt` / `platformGrantedBy`
 * Chosen over a mapping collection because the login already lives there:
 * deleting the account removes its access with it, and there's nothing to
 * keep in sync.
 *
 * Legacy fallback: an owner-company `super_admin` with no role assigned and
 * not revoked is treated as Platform Owner, exactly as before roles existed,
 * so nobody gets locked out.
 */

export const PLATFORM_ROLES_COLLECTION = "platform_roles";
export const OWNER_ROLE_ID = "owner";

export interface PlatformRole {
  _id: string;
  name: string;
  description: string;
  /** Permission keys, or ["*"] for Platform Owner. */
  permissions: string[];
  builtIn: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

const BUILT_INS: { _id: string; name: string; description: string; permissions: string[] }[] = [
  { _id: OWNER_ROLE_ID, name: "Platform Owner", description: "Everything in the Platform Console, including users & roles.", permissions: ["*"] },
  {
    _id: "billing",
    name: "Billing Manager",
    description: "Plans, subscriptions, invoices, coupons, add-ons, payments, tax settings and revenue.",
    permissions: ["plans.manage", "subscriptions.manage", "invoices.manage", "coupons.manage", "addons.manage", "payments.manage", "tax.manage", "revenue.read", "companies.read"],
  },
  {
    _id: "support",
    name: "Support",
    description: "Companies (view, suspend / reactivate, sign in as their Director for support), sign-ups and domains (view).",
    permissions: ["companies.read", "companies.status", "companies.impersonate", "signups.manage", "domains.read"],
  },
  { _id: "viewer", name: "Viewer", description: "Read-only access to every page.", permissions: VIEWER_PERMISSIONS },
];
const BUILT_IN_BY_ID = new Map(BUILT_INS.map((r) => [r._id, r]));

async function rolesCol() {
  return (await getPlatformDb()).collection<PlatformRole>(PLATFORM_ROLES_COLLECTION);
}

let seeded = false;
/** Idempotent; built-in docs only carry name/description (permissions come from code). */
export async function ensureBuiltInRoles(): Promise<void> {
  if (seeded) return;
  const c = await rolesCol();
  const now = new Date();
  await Promise.all(
    BUILT_INS.map((r) =>
      c.updateOne(
        { _id: r._id },
        { $set: { name: r.name, description: r.description, builtIn: true }, $setOnInsert: { permissions: [], createdAt: now, updatedAt: now, createdBy: null, updatedBy: null } },
        { upsert: true },
      ),
    ),
  );
  await c.createIndex({ name: 1 }).catch(() => {});
  seeded = true;
}

/** Test hook: forget that built-ins were seeded (a fresh database). */
export function resetRoleSeedCache(): void {
  seeded = false;
}

function withBuiltInPermissions(r: PlatformRole): PlatformRole {
  const b = BUILT_IN_BY_ID.get(r._id);
  return b ? { ...r, name: b.name, description: b.description, permissions: [...b.permissions], builtIn: true } : r;
}

export async function listRoles(): Promise<PlatformRole[]> {
  await ensureBuiltInRoles();
  const docs = await (await rolesCol()).find({}).toArray();
  const order = (r: PlatformRole) => (BUILT_IN_BY_ID.has(r._id) ? BUILT_INS.findIndex((b) => b._id === r._id) : 100);
  return docs.map(withBuiltInPermissions).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export async function getRole(id: string | null | undefined): Promise<PlatformRole | null> {
  if (!id) return null;
  await ensureBuiltInRoles();
  const doc = await (await rolesCol()).findOne({ _id: String(id) });
  return doc ? withBuiltInPermissions(doc) : null;
}

// ─── Access resolution ──────────────────────────────────────────────────────

export interface PlatformAccess {
  roleId: string;
  roleName: string;
  permissions: string[];
  /** True when this is the legacy super_admin fallback (no role assigned). */
  legacy: boolean;
}

export interface PlatformUserFields {
  roles?: string[];
  platformRoleId?: string | null;
  platformRevokedAt?: Date | null;
}

/** The Platform Console access an owner-company account has, or null for none. */
export async function resolvePlatformAccess(user: PlatformUserFields | null | undefined): Promise<PlatformAccess | null> {
  if (!user) return null;
  if (user.platformRoleId) {
    const role = await getRole(user.platformRoleId);
    if (role) return { roleId: role._id, roleName: role.name, permissions: role.permissions, legacy: false };
  }
  if (user.platformRevokedAt) return null;
  if ((user.roles ?? []).includes("super_admin")) return { roleId: OWNER_ROLE_ID, roleName: "Platform Owner", permissions: ["*"], legacy: true };
  return null;
}

interface AdminDoc extends PlatformUserFields {
  _id: ObjectId;
  email: string;
  name?: string;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  platformGrantedAt?: Date | null;
  platformGrantedBy?: string | null;
}

async function adminUsers() {
  return (await getDb()).collection<AdminDoc>("admin_users");
}

const PLATFORM_FIELDS = { email: 1, name: 1, roles: 1, platformRoleId: 1, platformRevokedAt: 1, platformGrantedAt: 1, platformGrantedBy: 1, lastLoginAt: 1, createdAt: 1 } as const;

function oid(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Access for an admin_users id in the CURRENT company scope (the owner's host). */
export async function getPlatformAccessForUser(userId: string): Promise<PlatformAccess | null> {
  const _id = oid(userId);
  if (!_id) return null;
  const doc = await (await adminUsers()).findOne({ _id }, { projection: PLATFORM_FIELDS });
  return resolvePlatformAccess(doc);
}

// ─── Platform users ─────────────────────────────────────────────────────────

export interface PlatformUserRow {
  id: string;
  email: string;
  name: string | null;
  roleId: string;
  roleName: string;
  legacy: boolean;
  grantedAt: Date | null;
  lastLoginAt: Date | null;
}

/** Candidates: accounts with a role assigned, or super_admins not revoked. */
const CANDIDATE_FILTER = { $or: [{ platformRoleId: { $nin: [null, ""] } }, { roles: "super_admin", platformRevokedAt: { $in: [null] } }] };

export async function listPlatformUsers(): Promise<PlatformUserRow[]> {
  const docs = await (await adminUsers()).find(CANDIDATE_FILTER as never, { projection: PLATFORM_FIELDS }).sort({ email: 1 }).limit(500).toArray();
  const rows: PlatformUserRow[] = [];
  for (const d of docs) {
    const a = await resolvePlatformAccess(d);
    if (!a) continue;
    rows.push({ id: d._id.toString(), email: d.email, name: d.name ?? null, roleId: a.roleId, roleName: a.roleName, legacy: a.legacy, grantedAt: d.platformGrantedAt ?? null, lastLoginAt: d.lastLoginAt ?? null });
  }
  return rows;
}

/** Owner-company accounts that don't have Platform Console access yet. */
export async function listEligibleHubUsers(): Promise<{ id: string; email: string; name: string | null }[]> {
  const docs = await (await adminUsers()).find({}, { projection: PLATFORM_FIELDS }).sort({ email: 1 }).limit(1000).toArray();
  const out: { id: string; email: string; name: string | null }[] = [];
  for (const d of docs) if (!(await resolvePlatformAccess(d))) out.push({ id: d._id.toString(), email: d.email, name: d.name ?? null });
  return out;
}

/** How many accounts currently have the Platform Owner role (assigned or legacy). */
export async function countPlatformOwners(): Promise<number> {
  return (await listPlatformUsers()).filter((u) => u.roleId === OWNER_ROLE_ID).length;
}

export type RoleResult = { ok: true } | { ok: false; error: string };
export interface Actor {
  id: string;
  permissions: string[];
}

export async function assignPlatformRole(userId: string, roleId: string, actor: Actor): Promise<RoleResult> {
  const _id = oid(userId);
  if (!_id) return { ok: false, error: "Unknown account." };
  const col = await adminUsers();
  const doc = await col.findOne({ _id }, { projection: PLATFORM_FIELDS });
  if (!doc) return { ok: false, error: "That account isn't part of this company." };
  const role = await getRole(roleId);
  if (!role) return { ok: false, error: "Choose a role." };
  if (!coversPermissions(actor.permissions, role.permissions)) return { ok: false, error: `You can't grant ${role.name} — it has permissions you don't have.` };
  const current = await resolvePlatformAccess(doc);
  if (current && !coversPermissions(actor.permissions, current.permissions)) return { ok: false, error: `You can't change ${doc.email}'s access — their role has permissions you don't have.` };
  if (current?.roleId === OWNER_ROLE_ID && role._id !== OWNER_ROLE_ID && (await countPlatformOwners()) <= 1) {
    return { ok: false, error: "This is the last Platform Owner. Make someone else a Platform Owner first." };
  }
  const now = new Date();
  await col.updateOne({ _id }, { $set: { platformRoleId: role._id, platformRevokedAt: null, platformGrantedAt: now, platformGrantedBy: actor.id } });
  await recordPlatformAudit({
    actorId: actor.id,
    action: current ? "platform_user.role_change" : "platform_user.grant",
    target: { type: "admin_user", id: userId },
    details: { email: doc.email, from: current ? current.roleId : null, to: role._id, ...(current?.legacy ? { fromLegacy: true } : {}) },
  });
  return { ok: true };
}

export async function revokePlatformAccess(userId: string, actor: Actor): Promise<RoleResult> {
  const _id = oid(userId);
  if (!_id) return { ok: false, error: "Unknown account." };
  const col = await adminUsers();
  const doc = await col.findOne({ _id }, { projection: PLATFORM_FIELDS });
  if (!doc) return { ok: false, error: "That account isn't part of this company." };
  const current = await resolvePlatformAccess(doc);
  if (!current) return { ok: false, error: `${doc.email} doesn't have Platform Console access.` };
  if (!coversPermissions(actor.permissions, current.permissions)) return { ok: false, error: `You can't revoke ${doc.email} — their role has permissions you don't have.` };
  if (current.roleId === OWNER_ROLE_ID && (await countPlatformOwners()) <= 1) return { ok: false, error: "This is the last Platform Owner. Make someone else a Platform Owner first." };
  await col.updateOne({ _id }, { $set: { platformRoleId: null, platformRevokedAt: new Date() } });
  await recordPlatformAudit({ actorId: actor.id, action: "platform_user.revoke", target: { type: "admin_user", id: userId }, details: { email: doc.email, role: current.roleId } });
  return { ok: true };
}

// ─── Custom roles ───────────────────────────────────────────────────────────

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

function cleanRoleInput(input: RoleInput): { ok: true; name: string; description: string; permissions: PlatformPermission[] } | { ok: false; error: string } {
  const name = String(input?.name ?? "").trim().replace(/\s+/g, " ");
  const description = String(input?.description ?? "").trim().slice(0, 300);
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Give the role a name (2–60 characters)." };
  const raw = Array.isArray(input?.permissions) ? input.permissions.map(String) : [];
  const unknown = raw.filter((p) => !isPlatformPermission(p));
  if (unknown.length) return { ok: false, error: `Unknown permission: ${unknown[0]}` };
  const permissions = [...new Set(raw)] as PlatformPermission[];
  if (permissions.length === 0) return { ok: false, error: "Choose at least one permission." };
  return { ok: true, name, description, permissions: ALL_PERMISSIONS.filter((p) => permissions.includes(p)) };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const c = await rolesCol();
  const hit = await c.findOne({ name: { $regex: `^${escapeRe(name)}$`, $options: "i" }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { projection: { _id: 1 } });
  return Boolean(hit);
}

export async function createRole(input: RoleInput, actor: Actor): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await ensureBuiltInRoles();
  const clean = cleanRoleInput(input);
  if (!clean.ok) return clean;
  if (!coversPermissions(actor.permissions, clean.permissions)) return { ok: false, error: "A role can't have permissions you don't have yourself." };
  if (await nameTaken(clean.name)) return { ok: false, error: `A role called "${clean.name}" already exists.` };
  const now = new Date();
  const id = randomUUID();
  await (await rolesCol()).insertOne({ _id: id, name: clean.name, description: clean.description, permissions: clean.permissions, builtIn: false, createdAt: now, updatedAt: now, createdBy: actor.id, updatedBy: actor.id });
  await recordPlatformAudit({ actorId: actor.id, action: "platform_role.create", target: { type: "platform_role", id }, details: { name: clean.name, permissions: clean.permissions } });
  return { ok: true, id };
}

export async function updateRole(id: string, input: RoleInput, actor: Actor): Promise<RoleResult> {
  const role = await getRole(id);
  if (!role) return { ok: false, error: "Role not found." };
  if (role.builtIn) return { ok: false, error: "Built-in roles can't be changed. Create a custom role instead." };
  const clean = cleanRoleInput(input);
  if (!clean.ok) return clean;
  if (!coversPermissions(actor.permissions, clean.permissions) || !coversPermissions(actor.permissions, role.permissions)) return { ok: false, error: "A role can't have permissions you don't have yourself." };
  if (await nameTaken(clean.name, id)) return { ok: false, error: `A role called "${clean.name}" already exists.` };
  await (await rolesCol()).updateOne({ _id: id, builtIn: false }, { $set: { name: clean.name, description: clean.description, permissions: clean.permissions, updatedAt: new Date(), updatedBy: actor.id } });
  const added = clean.permissions.filter((p) => !role.permissions.includes(p));
  const removed = role.permissions.filter((p) => !clean.permissions.includes(p as PlatformPermission));
  await recordPlatformAudit({ actorId: actor.id, action: "platform_role.update", target: { type: "platform_role", id }, details: { name: clean.name, ...(role.name !== clean.name ? { renamedFrom: role.name } : {}), added, removed } });
  return { ok: true };
}

export async function countRoleUsers(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const u of await listPlatformUsers()) out[u.roleId] = (out[u.roleId] ?? 0) + 1;
  return out;
}

export async function deleteRole(id: string, actor: Actor): Promise<RoleResult> {
  const role = await getRole(id);
  if (!role) return { ok: false, error: "Role not found." };
  if (role.builtIn) return { ok: false, error: "Built-in roles can't be deleted." };
  if (!coversPermissions(actor.permissions, role.permissions)) return { ok: false, error: "You can't delete a role that has permissions you don't have." };
  const assigned = await (await adminUsers()).countDocuments({ platformRoleId: id });
  if (assigned > 0) return { ok: false, error: `${assigned} user${assigned === 1 ? " has" : "s have"} this role. Give them another role first.` };
  await (await rolesCol()).deleteOne({ _id: id, builtIn: false });
  await recordPlatformAudit({ actorId: actor.id, action: "platform_role.delete", target: { type: "platform_role", id }, details: { name: role.name } });
  return { ok: true };
}

export { hasPermission };
