import { NextRequest } from "next/server";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canViewAllEmployees } from "@/lib/hrms-roles";
import { hasBearer } from "@/lib/security/bearer";
import { hasPlanFlag } from "@/lib/platform/billing/enforce";

/**
 * Guards HRMS-only API routes (e.g. the employee CSV export). Accepts either a
 * logged-in HRMS session cookie or an `HRMS_API_SECRET` bearer token for
 * cron / external tooling. Mirrors `src/lib/api-auth.ts`.
 */
export async function isAuthorizedHrmsRequest(req: NextRequest): Promise<boolean> {
  // Machine access with the shared secret is the plan's "API access" feature.
  if (hasBearer(req, process.env.HRMS_API_SECRET) && (await hasPlanFlag("apiAccess"))) return true;

  // The product session — and only someone who may see EVERY employee: the export is the whole roster (personal details, contacts).
  const user = await getCurrentHrmsUser();
  return user !== null && canViewAllEmployees(user);
}
