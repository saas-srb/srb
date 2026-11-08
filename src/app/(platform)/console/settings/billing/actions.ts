"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getBillingSettings, saveBillingSettings, type PlatformBillingSettings, type SettingsResult } from "@/lib/platform/billing/settings";

type Editable = Omit<PlatformBillingSettings, "updatedAt" | "updatedBy">;

/** Dotted paths whose values differ ("tax.gstRatePercent", …) — for the audit log. */
function changedFields(before: Editable, after: Editable): string[] {
  const out: string[] = [];
  for (const group of ["seller", "tax", "invoice", "billing"] as const) {
    const a = before[group] as unknown as Record<string, unknown>;
    const b = after[group] as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) out.push(`${group}.${key}`);
  }
  return out;
}

export async function saveBillingSettingsAction(input: Editable): Promise<SettingsResult> {
  const auth = await checkPlatformPermission("tax.manage");
  if (!auth.ok) return { ok: false, errors: { form: auth.error } };
  const user = auth.user;
  const str = (v: unknown) => String(v ?? "");
  const before = await getBillingSettings();
  const res = await saveBillingSettings(
    {
      seller: {
        legalName: str(input?.seller?.legalName),
        tradeName: str(input?.seller?.tradeName),
        gstin: str(input?.seller?.gstin),
        stateCode: str(input?.seller?.stateCode),
        address: str(input?.seller?.address),
        email: str(input?.seller?.email),
        phone: str(input?.seller?.phone),
        pan: str(input?.seller?.pan),
      },
      tax: { gstRatePercent: Number(input?.tax?.gstRatePercent), sacCode: str(input?.tax?.sacCode), pricesIncludeTax: Boolean(input?.tax?.pricesIncludeTax) },
      invoice: { prefix: str(input?.invoice?.prefix), footerNote: str(input?.invoice?.footerNote), terms: str(input?.invoice?.terms) },
      billing: {
        currency: str(input?.billing?.currency),
        defaultTrialDays: Number(input?.billing?.defaultTrialDays),
        graceDays: Number(input?.billing?.graceDays),
        trialReminderDays: Array.isArray(input?.billing?.trialReminderDays) ? input.billing.trialReminderDays.map(Number) : [],
      },
    },
    user.id,
  );
  if (res.ok) {
    const after = await getBillingSettings();
    const changed = changedFields(before, after);
    await recordPlatformAudit({
      actorId: user.id,
      action: "settings.billing.update",
      target: { type: "platform_settings", id: "billing" },
      details: {
        changed,
        ...(changed.includes("tax.gstRatePercent") ? { gstRatePercent: { from: before.tax.gstRatePercent, to: after.tax.gstRatePercent } } : {}),
        ...(changed.includes("billing.defaultTrialDays") ? { defaultTrialDays: { from: before.billing.defaultTrialDays, to: after.billing.defaultTrialDays } } : {}),
        ...(changed.includes("billing.graceDays") ? { graceDays: { from: before.billing.graceDays, to: after.billing.graceDays } } : {}),
      },
    });
    revalidatePath("/console", "layout");
  }
  return res;
}
