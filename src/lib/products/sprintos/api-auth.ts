import { NextRequest } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { hasPmsStaffRole } from "@/lib/pms-roles";
import { hasBearer } from "@/lib/security/bearer";
import { hasPlanFlag } from "@/lib/platform/billing/enforce";

/**
 * Guards PMS-only API routes (CSV exports). Accepts either a logged-in PMS
 * session cookie or a `PMS_API_SECRET` bearer token for cron / external tooling.
 * Mirrors `src/lib/talentos/api-auth.ts`.
 */
export async function isAuthorizedPmsRequest(req: NextRequest): Promise<boolean> {
  // Machine access with the shared secret is the plan's "API access" feature.
  if (hasBearer(req, process.env.PMS_API_SECRET) && (await hasPlanFlag("apiAccess"))) return true;

  // The product session — staff only: project members see their own projects, never the whole client / project book.
  const user = await getCurrentPmsUser();
  return user !== null && hasPmsStaffRole(user.roles);
}
