import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { userNames } from "@/lib/products/playbook-ai/people";
import { hasSeoAccess } from "@/lib/seo-roles";

/** The SEO team: every login that can open the SEO product — the assignee list for tasks and issues. */
export async function listSeoUsers(): Promise<{ id: string; label: string; email: string }[]> {
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; email: string; roles?: string[] }>("admin_users")
    .find({}, { projection: { email: 1, roles: 1 } })
    .sort({ email: 1 })
    .toArray();
  const seoUsers = users.filter((u) => hasSeoAccess(u.roles));
  const names = await userNames(seoUsers.map((u) => u._id.toString()));
  return seoUsers.map((u) => ({ id: u._id.toString(), label: names.get(u._id.toString()) ?? u.email, email: u.email }));
}

export { userNames };
