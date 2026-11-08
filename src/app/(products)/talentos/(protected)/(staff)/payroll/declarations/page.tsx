import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import DeclarationReview from "@/components/products/talentos/DeclarationReview";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { financialYearOf } from "@/lib/products/talentos/payroll/rates";
import { listDeclarations } from "@/lib/products/talentos/tax-declarations";

export default async function DeclarationsPage() {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");
  const fy = financialYearOf(new Date().toISOString().slice(0, 7));
  const [decls, employees] = await Promise.all([listDeclarations(fy), listEmployeeOptions()]);
  const byId = new Map(employees.map((e) => [e._id, e]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Payroll", href: "/talentos/payroll" }, { label: "Tax declarations" }]}
        title={<>Tax declarations</>}
        description={<>Review what employees declare for income tax and verify it against their proofs.</>}
      />
      <DeclarationReview
        fy={fy}
        rows={decls.map((d) => ({
          _id: d._id,
          employeeName: byId.get(d.employeeId)?.name ?? "Former employee",
          employeeCode: byId.get(d.employeeId)?.employeeCode ?? "",
          regime: d.regime,
          status: d.status,
          declared: d.declared as unknown as Record<string, number | boolean | string>,
          verified: d.verified as unknown as Record<string, number | boolean | string>,
          landlordPan: d.landlordPan,
          hrNote: d.hrNote,
          previousTds: d.previousEmployer.tds,
        }))}
      />
    </div>
  );
}
