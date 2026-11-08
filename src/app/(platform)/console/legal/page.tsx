import type { Metadata } from "next";
import Link from "next/link";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getLegalProfile, legalGaps } from "@/lib/platform/saas/legal-profile";
import { LEGAL_LINKS } from "@/lib/platform/saas/site";
import LegalProfileForm from "./LegalProfileForm";

export const metadata: Metadata = { title: "Legal & compliance" };
export const dynamic = "force-dynamic";

export default async function PlatformLegalPage() {
  const user = await requirePlatformPermission("settings.read");
  const profile = await getLegalProfile();
  const gaps = legalGaps(profile);
  const missingRequired = gaps.filter((g) => g.required);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Legal & compliance"
        description="Who the public policies say you are: operator, registered office, Grievance Officer and courts. The Terms, Privacy Policy, Refund Policy, Data Processing Addendum and Grievance Redressal page are written for India from these details. A field left empty is left out of the pages; nothing is made up."
        crumbs={[{ label: "Administration" }]}
      />
      <div className={`rounded-lg border p-4 text-sm ${missingRequired.length ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
        {missingRequired.length ? (
          <>
            <p className="font-medium">Before you launch, add the details Indian law expects on these pages:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {missingRequired.map((g) => <li key={g.field}><span className="font-medium">{g.label}.</span> {g.why}</li>)}
            </ul>
          </>
        ) : (
          <p className="font-medium">All details required on the public policies are filled in.</p>
        )}
        {gaps.some((g) => !g.required) && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
            {gaps.filter((g) => !g.required).map((g) => <li key={g.field}><span className="font-medium text-foreground">{g.label} (recommended).</span> {g.why}</li>)}
          </ul>
        )}
      </div>
      <LegalProfileForm
        initial={{ constitution: profile.constitution, registrationType: profile.registrationType, registrationNo: profile.registrationNo, registeredOffice: profile.registeredOffice, grievanceName: profile.grievanceName, grievanceDesignation: profile.grievanceDesignation, grievanceEmail: profile.grievanceEmail, grievancePhone: profile.grievancePhone, jurisdictionCity: profile.jurisdictionCity, jurisdictionState: profile.jurisdictionState, effectiveDate: profile.effectiveDate }}
        fromBilling={{ legalName: profile.legalName, tradeName: profile.tradeName, gstin: profile.gstin }}
        canEdit={can(user, "settings.manage")}
        updated={profile.updatedAt ? `${new Date(profile.updatedAt).toLocaleString("en-IN")} by ${profile.updatedBy ?? "—"}` : null}
      />
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Published policies</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {LEGAL_LINKS.filter((l) => l.href !== "/status").map((l) => <li key={l.href}><Link href={l.href} target="_blank" className="text-primary hover:underline">{l.label}</Link></li>)}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Have your legal counsel review these pages before launch, as with any contract. The policy wording lives in <code>src/lib/platform/saas/legal-india.ts</code>.</p>
      </div>
    </div>
  );
}
