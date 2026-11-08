import { NextRequest } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { hasBearer } from "@/lib/security/bearer";
import { hasPlanFlag } from "@/lib/platform/billing/enforce";
import type { LmsPermission } from "@/lib/lms-roles";

/**
 * Guards LMS-only endpoints (reading/editing/deleting stored lead PII) with
 * either a logged-in LMS session cookie (used by the /dealflow-ai UI, e.g. a plain
 * <a href> resume download that can't send a custom header) or a bearer secret
 * (for external tooling/scripts). Public submission endpoints (POST) intentionally
 * skip this.
 */
export async function isAuthorizedLmsRequest(req: NextRequest, permission: LmsPermission = "VIEW_LEADS"): Promise<boolean> {
  // Machine access with the shared secret is the plan's "API access" feature.
  if (hasBearer(req, process.env.LEADS_API_SECRET) && (await hasPlanFlag("apiAccess"))) return true;

  // The product session, or the Workspace session of an account with this product's role.
  return (await requireLms(permission)) !== null;
}
