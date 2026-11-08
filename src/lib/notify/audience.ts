import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { PANEL_ROLES } from "@/lib/ai/agent/access";
import type { NotifyPanel } from "@/lib/notify/panels";

/**
 * Who a product-wide notification goes to: only people who can actually open that product at that level (roles), never everyone.
 *   any   — anyone who can open the product
 *   staff — people who run the product's records
 *   admin — people who configure it
 * `super_admin` is always included (they can open every product). Deactivated accounts have no roles, so they never match.
 */
const OPEN_TO_ANY_ACCOUNT = new Set<NotifyPanel>(["workspace", "support", "platform"]);

export type Audience = "any" | "staff" | "admin";

export async function audienceUserIds(panel: NotifyPanel, level: Audience, extraRoles: string[] = []): Promise<string[]> {
  const def = PANEL_ROLES[panel];
  const roles = new Set<string>(["super_admin", ...(def ? def[level] : []), ...extraRoles]);
  const rows = await (await getDb()).collection<{ _id: ObjectId }>("admin_users").find({ roles: { $in: [...roles] }, status: { $nin: BLOCKED_STATUSES } }, { projection: { _id: 1 } }).limit(500).toArray();
  return rows.map((r) => String(r._id));
}

/** Of `userIds`, those who can still open `product` (roles may have changed since the event). Super admins always can. */
export async function canOpen(panel: NotifyPanel, userIds: string[]): Promise<string[]> {
  const ids = userIds.filter((i) => ObjectId.isValid(i));
  if (ids.length === 0) return [];
  const def = PANEL_ROLES[panel];
  // The Workspace, Help & Support and the Platform Console have no role list of their own: any signed-in (active) account of the company can be addressed.
  const open = OPEN_TO_ANY_ACCOUNT.has(panel);
  const roles = new Set<string>(["super_admin", ...(def ? def.any : [])]);
  const rows = await (await getDb()).collection<{ _id: ObjectId }>("admin_users").find({ _id: { $in: ids.map((i) => new ObjectId(i)) }, status: { $nin: BLOCKED_STATUSES }, roles: open ? { $exists: true, $ne: [] } : { $in: [...roles] } }, { projection: { _id: 1 } }).toArray();
  return rows.map((r) => String(r._id));
}

/** Accounts holding any of `roles` plus every super_admin — for events whose audience is a named set of roles (e.g. accounts receivable). */
export async function userIdsByRoles(roles: string[]): Promise<string[]> {
  const rows = await (await getDb()).collection<{ _id: ObjectId }>("admin_users").find({ roles: { $in: ["super_admin", ...roles] }, status: { $nin: BLOCKED_STATUSES } }, { projection: { _id: 1 } }).limit(500).toArray();
  return rows.map((r) => String(r._id));
}
