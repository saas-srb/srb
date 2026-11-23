import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import TaxDeclarationForm from "@/components/products/talentos/TaxDeclarationForm";
import { notFound } from "next/navigation";
import { hrPage } from "@/lib/products/talentos/page-guard";
import { hrCan } from "@/lib/talentos-access";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { financialYearOf } from "@/lib/products/talentos/payroll/rates";
import { getDeclaration, NO_PREVIOUS_EMPLOYER, parseDeductions } from "@/lib/products/talentos/tax-declarations";

export default async function MyTaxPage() {
  const guard = await hrPage("tax.view", "My tax declaration");
  if (!guard.user) return guard.locked;
  const employeeId = guard.user.employeeId;
  if (!employeeId) notFound();
  const canDeclare = hrCan(guard.user, "tax.declare");
  const config = await getPayrollConfig();
  const fy = financialYearOf(new Date().toISOString().slice(0, 7));
  const d = await getDeclaration(employeeId, fy);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "My tax declaration" }]}
        title={<>My tax declaration</>}
        description={<>Choose your tax regime and declare investments so your monthly income tax is worked out correctly.</>}
      />
      <TaxDeclarationForm
        key={`${d?._id ?? "new"}-${d?.status ?? "none"}-${d?.updatedAt?.toString() ?? ""}`}
        fy={fy}
        canDeclare={canDeclare}
        status={d?.status ?? "none"}
        hrNote={d?.hrNote ?? null}
        initial={{
          regime: d?.regime ?? config.defaultTaxRegime,
          declared: (d?.declared ?? parseDeductions({})) as unknown as Record<string, number | boolean | string>,
          previousEmployer: d?.previousEmployer ?? NO_PREVIOUS_EMPLOYER,
          landlordPan: d?.landlordPan ?? null,
        }}
        verified={d?.status === "verified" ? (d.verified as unknown as Record<string, number | boolean | string>) : null}
      />
    </div>
  );
}
