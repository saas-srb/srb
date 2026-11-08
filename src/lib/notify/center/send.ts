import "server-only";
import { ObjectId } from "mongodb";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { getDb } from "@/lib/mongodb";
import type { AnnouncementAudience } from "@/lib/notify/center/shared";

export const MAX_RECIPIENTS = 1000;

/** The accounts an audience means right now (blocked and deactivated accounts never match). */
export async function resolveAudience(a: AnnouncementAudience): Promise<string[]> {
  const users = (await getDb()).collection<{ _id: ObjectId }>("admin_users");
  const active = { status: { $nin: BLOCKED_STATUSES } };
  let filter: Record<string, unknown>;
  if (a.type === "everyone") filter = { ...active, roles: { $exists: true, $ne: [] } };
  else if (a.type === "roles") {
    const roles = a.roles.filter((r) => typeof r === "string" && r.length <= 60).slice(0, 40);
    if (roles.length === 0) return [];
    filter = { ...active, roles: { $in: roles } };
  } else {
    const ids = a.ids.filter((i) => typeof i === "string" && ObjectId.isValid(i)).slice(0, MAX_RECIPIENTS).map((i) => new ObjectId(i));
    if (ids.length === 0) return [];
    filter = { ...active, _id: { $in: ids } };
  }
  return (await users.find(filter, { projection: { _id: 1 } }).limit(MAX_RECIPIENTS).toArray()).map((u) => String(u._id));
}
