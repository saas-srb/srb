import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { storedUsageActor, SYSTEM_ACTOR, VISITOR_ACTOR, type UsageActor } from "@/lib/platform/billing/usage-actor-store";

/**
 * Who is making this request, for the usage history. Looked up from the session cookies the browser sent, the same way the products do
 * (every product keeps `{ tokenHash, adminId }` rows). Work inside a request with no sign-in is a website visitor (the public chatbot,
 * voice, forms); work outside any request (cron, automations) is the system. Never throws: history must not break the work it describes.
 */

/** Session cookie → the collection holding that product's sessions. The Workspace session is tried first. */
const COOKIE_COLLECTIONS: [cookie: string, collection: string][] = [
  ["hub_session", "hub_sessions"], ["lms_session", "admin_sessions"], ["hrms_session", "hrms_sessions"], ["pms_session", "pms_sessions"], ["prms_session", "prms_sessions"],
  ["tms_session", "tms_sessions"], ["fms_session", "fms_sessions"], ["smms_session", "smms_sessions"], ["sop_session", "sop_sessions"], ["dlms_session", "dlms_sessions"],
  ["seo_session", "seo_sessions"], ["ots_session", "ots_sessions"], ["lpms_session", "lpms_sessions"], ["aibots_session", "aibots_sessions"], ["messenger_session", "messenger_sessions"],
  ["cms_session", "cms_sessions"],
];

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

const fromRequest = cache(async (): Promise<UsageActor> => {
  let store: Awaited<ReturnType<typeof cookies>>;
  try {
    store = await cookies();
  } catch {
    return SYSTEM_ACTOR; // not inside a request: a scheduled / background job
  }
  try {
    const db = await getDb();
    const now = new Date();
    for (const [cookie, collection] of COOKIE_COLLECTIONS) {
      const token = store.get(cookie)?.value;
      if (!token) continue;
      const session = await db.collection<{ adminId: ObjectId }>(collection).findOne({ tokenHash: sha(token), expiresAt: { $gt: now } } as never, { projection: { adminId: 1 } });
      if (!session?.adminId) continue;
      const user = await db.collection<{ email?: string; name?: string }>("admin_users").findOne({ _id: session.adminId as never }, { projection: { email: 1, name: 1 } });
      if (!user) continue;
      return { key: `user:${String(session.adminId)}`, kind: "user", id: String(session.adminId), label: user.name?.trim() ? `${user.name.trim()} (${user.email})` : String(user.email) };
    }
    const portalToken = store.get("portal_session")?.value;
    if (portalToken) {
      const session = await db.collection<{ userId: string }>("portal_sessions").findOne({ tokenHash: sha(portalToken), expiresAt: { $gt: now } } as never, { projection: { userId: 1 } });
      if (session?.userId) {
        const u = await db.collection<{ email?: string; displayName?: string }>("external_users").findOne({ _id: session.userId } as never, { projection: { email: 1, displayName: 1 } });
        return { key: `portal:${session.userId}`, kind: "portal", id: session.userId, label: `${u?.displayName || u?.email || "Portal user"} (portal)` };
      }
    }
    return VISITOR_ACTOR;
  } catch (err) {
    console.error("[usage] could not resolve who is using", err);
    return SYSTEM_ACTOR;
  }
});

/** The person behind the current work: an explicit one (`withUsageActor`) wins, then the request's sign-in. */
export async function resolveUsageActor(): Promise<UsageActor> {
  return storedUsageActor() ?? (await fromRequest());
}
