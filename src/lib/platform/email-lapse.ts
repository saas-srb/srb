import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId, runAsCompany } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { isEmailLapsed, verifyDaysLeft, verifyDeadline, type EmailLapse } from "@/lib/platform/email-lapse-rule";
import { isEmailVerified } from "@/lib/platform/email-verification-rule";

export type { EmailLapse } from "@/lib/platform/email-lapse-rule";

/**
 * Registering a company starts a 30-day clock for verifying its email. If it runs out unverified the workspace is put on hold: people
 * can still sign in, but every page leads to `/commandos/verify-required` (and changes are refused) until a Director verifies. Verifying
 * lifts it at once. "Verified" = at least one Director has a verified address; a company with no unverified Director never lapses.
 */
const TTL_MS = 20_000;
const memo = new Map<string, { at: number; value: EmailLapse }>();

export function forgetEmailLapse(): void {
  memo.clear();
}

export async function emailLapseFor(companyId: string): Promise<EmailLapse> {
  const hit = memo.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const open = (createdAt = new Date()): EmailLapse => ({ lapsed: false, pending: false, daysLeft: 0, deadline: verifyDeadline(createdAt) });
  let value = open();
  try {
    const company = await getCompany(companyId);
    if (company) {
      const now = new Date();
      const directors = await runAsCompany(companyId, async () =>
        (await getDb()).collection("admin_users").find({ $or: [{ designationId: "director" }, { roles: "super_admin" }] }, { projection: { emailVerified: 1 } }).limit(50).toArray(),
      );
      const exempt = company.isPlatformOwner || !!company.isDemo;
      const verified = directors.length === 0 || directors.some((d) => isEmailVerified(d));
      value = {
        lapsed: isEmailLapsed({ createdAt: company.createdAt, dueAt: company.emailVerifyDueAt, now, verified, exempt }),
        pending: !exempt && !verified,
        daysLeft: verifyDaysLeft(company.createdAt, now, company.emailVerifyDueAt),
        deadline: verifyDeadline(company.createdAt, company.emailVerifyDueAt),
      };
    }
  } catch (err) {
    console.error("[email-lapse] lookup failed", err); // fails open: a database blip must not lock a company out
  }
  if (memo.size > 2000) memo.clear();
  memo.set(companyId, { at: Date.now(), value });
  return value;
}

/** The current company's state, once per request. */
export const getEmailLapse = cache(async (): Promise<EmailLapse> => emailLapseFor(await currentCompanyId()));

/** Page guard for the signed-in areas: a company on hold goes to the page that explains it. */
export async function emailLapseGate(): Promise<void> {
  if ((await getEmailLapse()).lapsed) redirect("/commandos/verify-required");
}

export interface UnverifiedDirector {
  id: string;
  email: string;
}

/** The Directors who still have to verify, oldest account first. */
export async function unverifiedDirectors(): Promise<UnverifiedDirector[]> {
  const rows = await (await getDb())
    .collection("admin_users")
    .find({ $or: [{ designationId: "director" }, { roles: "super_admin" }], emailVerified: false }, { projection: { email: 1 } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();
  return rows.map((r) => ({ id: String(r._id), email: String(r.email) }));
}
