import "server-only";
import { registerCallSettledHandler } from "@/lib/products/agentos/calls/engine";
import { registerTargetAuthorizer } from "@/lib/products/agentos/calls/integrations";
import { lmsCan } from "@/lib/lms-roles";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import { registerDoNotContactProvider } from "@/lib/products/agentos/calls/dnc";
import { registerCallerLookup } from "@/lib/products/agentos/calls/public-inbound";
import { registerBriefingProvider } from "@/lib/products/agentos/calls/briefing";
import { dealflowBriefing } from "@/lib/dealflow-ai/call-briefing";
import { DEALFLOW_PRODUCT } from "@/lib/dealflow-ai/call-targets";
import { dealflowCallerLookup, dealflowDoNotContact, dealflowEntityExists, recordDealflowCall } from "@/lib/dealflow-ai/call-results";

/**
 * Who may point a call at a DealFlow record: the same permission the page that offers the call button needs (leads and submissions:
 * VIEW_LEADS, job applicants: VIEW_CAREERS), and the record must exist.
 */
export async function authorizeDealflowTarget(viewer: AibotsViewer, target: CallTarget): Promise<boolean> {
  if (target.product !== DEALFLOW_PRODUCT) return false;
  const needed = target.entityType === "lead" || target.entityType === "submission" ? "VIEW_LEADS" : target.entityType === "applicant" ? "VIEW_CAREERS" : null;
  if (!needed || !lmsCan(viewer.ctx, needed)) return false;
  return dealflowEntityExists(target);
}

/** Importing this file registers DealFlow with the calling engine (see src/instrumentation.ts). Registering twice just replaces the entry. */
export function registerDealflowCallHooks(): void {
  registerCallSettledHandler(DEALFLOW_PRODUCT, async (call) => { await recordDealflowCall(call); });
  registerDoNotContactProvider(DEALFLOW_PRODUCT, dealflowDoNotContact);
  registerCallerLookup(DEALFLOW_PRODUCT, dealflowCallerLookup);
  registerTargetAuthorizer(DEALFLOW_PRODUCT, authorizeDealflowTarget);
  registerBriefingProvider(DEALFLOW_PRODUCT, dealflowBriefing);
}
registerDealflowCallHooks();
