import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { loadRulebook, listRulebooks } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import TaxRulebookManager from "./TaxRulebookManager";

export const metadata: Metadata = { title: "Tax rulebook" };
export const dynamic = "force-dynamic";

/** The financial year (April to March) that today falls in, like "2026-27". */
function currentFy(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export default async function TaxRulebookPage() {
  const user = await requirePlatformPermission("settings.read");
  const listing = await listRulebooks(currentFy());
  const entries = await Promise.all(listing.map((l) => loadRulebook(l.fy)));
  const pending = entries.filter((e) => !e.confirmed).length;
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Tax rulebook"
        description="TDS sections, company income-tax rates, advance-tax instalments and the dates of returns and payments, one table for each financial year, published once for every company."
        crumbs={[{ label: "Administration" }]}
      />
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>Companies read these figures automatically; they never type a rate or a date. Check each year against the current Act and notifications before confirming. Extensions of due dates are announced during the year: update the dates here.</p>
      </div>
      <div className={`rounded-lg border p-4 text-sm ${pending ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
        {pending ? (
          <p><span className="font-medium">{pending} year(s) have not been checked.</span> Companies still use them, but every screen that relies on them carries a warning until you confirm.</p>
        ) : (
          <p className="font-medium">Every year has been confirmed.</p>
        )}
      </div>
      <TaxRulebookManager entries={entries} currentFy={currentFy()} canEdit={can(user, "settings.manage")} />
    </div>
  );
}
