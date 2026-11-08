import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, updateStamp } from "@/lib/products/cybervault/db";
import { normalizeDlmsRoles, isDlmsManagerTier, primaryDlmsRoleLabel } from "@/lib/dlms-roles";
import { userNames } from "@/lib/products/playbook-ai/people";
import { searchClients, listClientOptions } from "@/lib/products/sprintos/clients";

/**
 * Who may see which client. Managers/admins see everything; a DLMS Employee
 * only sees the clients (and, optionally, the company vault) listed in their
 * `dlms_access` row (`_id` = admin user id). No row = sees nothing.
 */

export interface AccessGrant {
  _id: string;
  companyAccess: boolean;
  clientIds: string[];
  updatedAt: Date;
  updatedBy: string | null;
}

export async function getAccess(userId: string): Promise<AccessGrant | null> {
  const db = await getDb();
  return db.collection<AccessGrant>(COLLECTIONS.access).findOne({ _id: userId });
}

export async function setAccess(userId: string, input: { companyAccess: boolean; clientIds: string[] }, actorId: string): Promise<{ added: string[] }> {
  const db = await getDb();
  const col = db.collection<AccessGrant>(COLLECTIONS.access);
  // Only real, live clients can be granted — a stray id must not silently widen access later.
  const valid = new Set((await listClientOptions()).map((c) => c._id));
  const clientIds = Array.from(new Set(input.clientIds.filter((id) => valid.has(id))));
  const before = await col.findOne({ _id: userId });
  await col.updateOne({ _id: userId }, { $set: { companyAccess: Boolean(input.companyAccess), clientIds, ...updateStamp(actorId) } }, { upsert: true });
  const prev = new Set(before?.clientIds ?? []);
  return { added: clientIds.filter((id) => !prev.has(id)) };
}

export interface DlmsUserRow {
  id: string;
  label: string;
  email: string;
  roles: string[];
  roleLabel: string;
  seesAll: boolean;
  companyAccess: boolean;
  clientIds: string[];
}

/** Every login with a DLMS role, with its current grant — for the Access screen. */
export async function listDlmsUsers(): Promise<DlmsUserRow[]> {
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; email: string; roles?: string[]; permissionOverrides?: Record<string, boolean> }>("admin_users")
    .find({}, { projection: { email: 1, roles: 1, permissionOverrides: 1 } })
    .sort({ email: 1 })
    .toArray();
  const dlmsUsers = users.filter((u) => normalizeDlmsRoles(u.roles).length > 0);
  const ids = dlmsUsers.map((u) => u._id.toString());
  const [names, grants] = await Promise.all([
    userNames(ids),
    db.collection<AccessGrant>(COLLECTIONS.access).find({ _id: { $in: ids } }).toArray(),
  ]);
  const byId = new Map(grants.map((g) => [g._id, g]));
  return dlmsUsers.map((u) => {
    const id = u._id.toString();
    const roles = u.roles ?? [];
    const all = isDlmsManagerTier({ roles });
    const g = byId.get(id);
    return {
      id,
      label: names.get(id) ?? u.email,
      email: u.email,
      roles,
      roleLabel: primaryDlmsRoleLabel(roles),
      seesAll: all,
      companyAccess: all || Boolean(g?.companyAccess),
      clientIds: g?.clientIds ?? [],
    };
  });
}

/** Users who should receive expiry alerts and access-review notices: managers/admins. */
export async function listDlmsManagerIds(): Promise<string[]> {
  const rows = await listDlmsUsers();
  return rows.filter((r) => r.seesAll).map((r) => r.id);
}

export { userNames };

/** Client master lookups — DLMS never stores client details, only the `pms_clients._id`. */
export interface ClientRef {
  _id: string;
  clientCode: string;
  companyName: string;
}

export async function clientRefs(ids: string[]): Promise<Map<string, ClientRef>> {
  const wanted = new Set(ids.filter(Boolean));
  if (wanted.size === 0) return new Map();
  const all = await listClientOptions();
  return new Map(all.filter((c) => wanted.has(c._id)).map((c) => [c._id, c]));
}

export async function listClientRefs(): Promise<ClientRef[]> {
  return listClientOptions();
}

export { searchClients };
