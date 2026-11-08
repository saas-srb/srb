import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CertificateTracker from "@/components/products/cashflow-ai/tds/CertificateTracker";
import LowerCertsManager from "@/components/products/cashflow-ai/tds/LowerCertsManager";
import TdsPeriodPicker from "@/components/products/cashflow-ai/tds/TdsPeriodPicker";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { financialYearOf, isFinancialYear, isQuarter, quarterOf, type Quarter } from "@/lib/products/cashflow-ai/tds/core";
import { listLowerCerts, listVendorChoices, loadCertificateTasks } from "@/lib/products/cashflow-ai/tds/certificates-store";
import { QUARTER_LABEL } from "@/lib/products/cashflow-ai/tds/statement";
import { sectionMap } from "@/lib/products/cashflow-ai/tds/store";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";

function fyOptions(current: string, chosen: string): string[] {
  const start = Number(current.slice(0, 4));
  const list = Array.from({ length: 5 }, (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, "0")}`);
  return list.includes(chosen) ? list : [...list, chosen].sort().reverse();
}

export default async function TdsCertificatesPage({ searchParams }: { searchParams: Promise<{ fy?: string; q?: string }> }) {
  const sp = await searchParams;
  const today = todayIst();
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(today);
  const qn = Number(sp.q);
  const quarter: Quarter = sp.q && isQuarter(qn) ? qn : quarterOf(today);
  const user = await getCurrentFmsUser();
  const canManage = !!user && canManageCompliance(user);

  const [tasks, lower, vendors, sections] = await Promise.all([loadCertificateTasks(fy, quarter), listLowerCerts(), listVendorChoices(), sectionMap(fy).then((m) => [...m.values()].filter((x) => x.active))]);
  const pending = tasks.filter((t) => !t.certificate);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS", href: "/cashflow-ai/tds" }, { label: "Certificates" }]}
        title={<>TDS certificates</>}
        description={<>Keep track of which vendors you have given their tax-deducted certificate (Form 16A) for each quarter. The certificate itself is generated from the TRACES portal by you or your CA; this page only records that it was issued.</>}
        actions={<TdsPeriodPicker fy={fy} quarter={quarter} basePath="/cashflow-ai/tds/certificates" fyOptions={fyOptions(financialYearOf(today), fy)} />}
      />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            Certificates for {QUARTER_LABEL[quarter]}, {fy}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{pending.length === 0 ? (tasks.length === 0 ? "" : "All issued") : `${pending.length} still to issue`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CertificateTracker
            rows={tasks.map((t) => ({ vendorId: t.vendorId, vendorName: t.vendorName, pan: t.pan, section: t.section, billCount: t.billCount, deducted: t.deducted, certificate: t.certificate ? { issuedOn: t.certificate.issuedOn, certificateNumber: t.certificate.certificateNumber, note: t.certificate.note } : null }))}
            fy={fy}
            quarter={quarter}
            canManage={canManage}
            today={today}
          />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Lower or nil deduction certificates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A vendor can get a certificate from the tax department allowing tax to be deducted at a lower rate, or not at all. Note them here. This is information only: it does not change the tax the app expects, it adds a note on the quarterly statement for bills it covers.
          </p>
          {sections.length === 0 && canManage && <p className="text-sm text-amber-700 dark:text-amber-400">No TDS section is switched on for your company (Sections &amp; rates), so a certificate cannot be added yet.</p>}
          <LowerCertsManager
            certs={lower.map((c) => ({ id: c._id, vendorId: c.vendorId, vendorName: c.vendorName, section: c.section, certificateNumber: c.certificateNumber, nil: c.nil, rate: c.rate, validFrom: c.validFrom, validTo: c.validTo, maxAmount: c.maxAmount, note: c.note }))}
            vendors={vendors}
            sections={sections.map((s) => s.code)}
            canManage={canManage}
            today={today}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
