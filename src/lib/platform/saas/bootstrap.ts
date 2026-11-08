import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { hashPassword } from "@/lib/lms-auth";
import { seedPanels } from "@/lib/platform/panels/store";
import { OWNER_ROLE_ID } from "@/lib/platform/console/roles";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

export type EnsureOperatorResult =
  | { created: false }
  | { created: true; companyName: string; email: string; temporaryPassword: string | null; panelsAdded: number };

/**
 * Makes sure the platform operator exists: the company that runs the product, holding the platform staff and the
 * Platform Console. Does nothing when one already exists. Used by the first start of a new deployment (see
 * `src/instrumentation.ts`).
 *
 * `password` omitted → a random one is generated, returned once as `temporaryPassword`, and must be changed at first sign-in.
 */
export async function ensureOperator(input: { email: string; name?: string; password?: string }): Promise<EnsureOperatorResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The operator's email address is not valid.");

  const db = await getPlatformDb();
  const companies = db.collection<Company>(COMPANIES_COLLECTION);
  if (await companies.findOne({ isPlatformOwner: true }, { projection: { _id: 1 } })) return { created: false };

  const generated = !input.password;
  const password = input.password ?? randomBytes(9).toString("base64url");
  const now = new Date();
  await companies.createIndex({ slug: 1 }, { unique: true });
  const company: Company = { _id: randomUUID(), slug: "platform", name: SAAS_BRAND.name, status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now };
  try {
    await companies.insertOne(company);
  } catch (err) {
    // Another instance starting at the same moment created it first.
    if ((err as { code?: number }).code === 11000) return { created: false };
    throw err;
  }

  await runAsCompany(company._id, async () => {
    const users = (await getDb()).collection("admin_users");
    await users.createIndex({ email: 1 }, { unique: true });
    await users.insertOne({
      email,
      name: input.name?.trim() || email.split("@")[0],
      passwordHash: hashPassword(password),
      roles: ["super_admin"],
      manualRoles: ["super_admin"],
      customRoleIds: [],
      designationId: "director",
      status: "active",
      permissionOverrides: {},
      userType: "system",
      notes: `Platform staff of ${SAAS_BRAND.name}`,
      employeeId: null,
      mustChangePassword: generated,
      emailVerified: true,
      emailVerifiedAt: now,
      platformRoleId: OWNER_ROLE_ID,
      platformGrantedAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  const panels = await seedPanels({ reset: false });
  return { created: true, companyName: company.name, email, temporaryPassword: generated ? password : null, panelsAdded: panels.inserted };
}
