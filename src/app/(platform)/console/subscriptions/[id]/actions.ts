"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import {
  adminCancel,
  adminChangePlan,
  adminExtendTrial,
  adminReactivate,
  adminSetComplimentary,
  adminSuspend,
  adminUnsuspend,
} from "@/lib/platform/billing/subscriptions-admin";
import type { BillingActionResult } from "@/lib/platform/billing/subscriptions";

export type SubscriptionAdminAction =
  | { kind: "change_plan"; planId: string; interval: string; when: string }
  | { kind: "extend_trial"; days: number }
  | { kind: "complimentary"; on: boolean }
  | { kind: "cancel"; when: string }
  | { kind: "suspend" }
  | { kind: "unsuspend" }
  | { kind: "reactivate"; days: number | null };

/** Every owner action on a company's subscription — access re-checked, audited in the service. */
export async function subscriptionAdminAction(companyId: string, action: SubscriptionAdminAction): Promise<BillingActionResult> {
  const user = await requirePlatformPermission("subscriptions.manage");
  const id = String(companyId ?? "");
  let res: BillingActionResult;
  switch (action?.kind) {
    case "change_plan":
      res = await adminChangePlan(id, { planId: String(action.planId ?? ""), interval: String(action.interval ?? ""), when: String(action.when ?? "auto") }, user.id);
      break;
    case "extend_trial":
      res = await adminExtendTrial(id, Number(action.days), user.id);
      break;
    case "complimentary":
      res = await adminSetComplimentary(id, Boolean(action.on), user.id);
      break;
    case "cancel":
      res = await adminCancel(id, String(action.when ?? "period_end"), user.id);
      break;
    case "suspend":
      res = await adminSuspend(id, user.id);
      break;
    case "unsuspend":
      res = await adminUnsuspend(id, user.id);
      break;
    case "reactivate":
      res = await adminReactivate(id, action.days === null || action.days === undefined ? null : Number(action.days), user.id);
      break;
    default:
      return { ok: false, error: "Unknown action." };
  }
  if (res.ok) revalidatePath("/console/subscriptions", "layout");
  return res;
}
