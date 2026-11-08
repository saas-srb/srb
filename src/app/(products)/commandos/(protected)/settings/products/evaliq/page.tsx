import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { SectionCard, Notice } from "@/components/products/evaliq/OtsUi";
import SettingsForm from "@/components/products/evaliq/SettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getOtsSettings } from "@/lib/products/evaliq/settings";
import { getDirectory } from "@/lib/products/evaliq/people";
import { formatDateTime } from "@/lib/utils";

export default async function EvaliqSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const [s, dir] = await Promise.all([getOtsSettings(), getDirectory()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "EvalIQ" },
        ]}
        title={<>EvalIQ Settings</>}
        description={<>Product-wide settings. Timing, attempts, marking, results and security are configured per test in the test builder.</>}
      />

      <SectionCard
        title="Online Test System"
        description={s.updatedAt ? `Last changed ${formatDateTime(s.updatedAt)}` : "Using defaults"}
      >
        <SettingsForm
          initial={{
            organizationName: s.organizationName,
            certificateNumberFormat: s.certificateNumberFormat,
            signatoryName: s.signatoryName,
            signatoryTitle: s.signatoryTitle,
            defaultValidityMonths: s.defaultValidityMonths,
            reminderHoursBeforeDue: s.reminderHoursBeforeDue,
            graceSeconds: s.graceSeconds,
            evaluatorUserIds: s.evaluatorUserIds,
          }}
          users={dir.users.map((u) => ({ id: u.value, label: u.label }))}
        />
      </SectionCard>

      <Notice>
        Who can do what is managed centrally by the Director at Admin → Users (roles <code>ots_admin</code>, <code>ots_manager</code>, <code>ots_author</code>, <code>ots_evaluator</code>, <code>ots_candidate</code>, plus per-permission overrides). Every TalentOS employee can take tests; HR and Cohort AI admins/managers manage them; mentors evaluate. Applicants and students take tests from the External Portal.
      </Notice>
    </div>
  );
}
