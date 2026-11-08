import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Tabs from "@/components/products/talentos/Tabs";
import OrgSettingsForm from "@/components/products/talentos/OrgSettingsForm";
import LeaveTypesManager from "@/components/products/talentos/LeaveTypesManager";
import PayrollConfigForm from "@/components/products/talentos/PayrollConfigForm";
import CompanyDetailsForm from "@/components/products/talentos/CompanyDetailsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getOrgSettings } from "@/lib/products/talentos/settings";
import { listLeaveTypes } from "@/lib/products/talentos/leave";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { getCompanyDetails } from "@/lib/products/talentos/company";

export default async function TalentosSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const sp = await searchParams;
  const allowedTabs = ["company", "schedule", "leave", "payroll"];
  const tab = allowedTabs.includes(sp.tab ?? "") ? sp.tab! : allowedTabs[0];

  const [settings, leaveTypes, payrollConfig, company] = await Promise.all([
    getOrgSettings(),
    listLeaveTypes(true),
    getPayrollConfig(),
    getCompanyDetails(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "TalentOS" },
        ]}
        title={<>TalentOS Settings</>}
        description={<>Company identity, work schedule, leave configuration and payroll policy.</>}
      />

      <Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          ...(company && settings
            ? [
                {
                  key: "company",
                  label: "Company",
                  content: (
                    <CompanyDetailsForm
                      details={{
                        name: company.name,
                        legalName: company.legalName,
                        addressLine1: company.addressLine1,
                        addressLine2: company.addressLine2,
                        city: company.city,
                        state: company.state,
                        postalCode: company.postalCode,
                        country: company.country,
                        email: company.email,
                        phone: company.phone,
                        website: company.website,
                        pan: company.pan,
                        gstin: company.gstin,
                        cin: company.cin,
                        pfEstablishmentCode: company.pfEstablishmentCode,
                        esiEstablishmentCode: company.esiEstablishmentCode,
                        tan: company.tan,
                        ptRegistration: company.ptRegistration,
                        lin: company.lin,
                        signatoryName: company.signatoryName,
                        signatoryDesignation: company.signatoryDesignation,
                        payslipNote: company.payslipNote,
                      }}
                    />
                  ),
                },
                {
                  key: "schedule",
                  label: "Work Schedule",
                  content: (
                    <OrgSettingsForm
                      settings={{
                        workingDays: settings.workingDays,
                        shiftStart: settings.shiftStart,
                        shiftEnd: settings.shiftEnd,
                        graceMinutes: settings.graceMinutes,
                        earlyDepartureMinutes: settings.earlyDepartureMinutes,
                        halfDayHours: settings.halfDayHours,
                        fullDayHours: settings.fullDayHours,
                        timezone: settings.timezone,
                        saturdayOffs: settings.saturdayOffs ?? [],
                        state: settings.state ?? null,
                      }}
                    />
                  ),
                },
                {
                  key: "leave",
                  label: "Leave Types",
                  content: (
                    <LeaveTypesManager
                      types={leaveTypes.map((t) => ({
                        _id: t._id,
                        code: t.code,
                        label: t.label,
                        paid: t.paid,
                        defaultAnnualQuota: t.defaultAnnualQuota,
                        allowNegativeBalance: t.allowNegativeBalance,
                        active: t.active,
                      }))}
                    />
                  ),
                },
              ]
            : []),
          ...(payrollConfig
            ? [
                {
                  key: "payroll",
                  label: "Payroll",
                  content: <PayrollConfigForm config={payrollConfigView(payrollConfig)} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function payrollConfigView(c: Awaited<ReturnType<typeof getPayrollConfig>>) {
  const { _id, updatedAt, updatedBy, ...rest } = c;
  void _id;
  void updatedAt;
  void updatedBy;
  return rest;
}
