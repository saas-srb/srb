import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listDepartments, listDesignations } from "@/lib/platform/organization";
import DesignationsClient, { type DesignationWithDetails } from "./DesignationsClient";

export const metadata: Metadata = {
  title: "Designations",
  robots: { index: false, follow: false },
};

export default async function DesignationsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.designations"); // Director-only item: anyone else sees the locked page inside this shell

  const [rawDesignations, departments] = await Promise.all([
    listDesignations(),
    listDepartments(),
  ]);

  const deptMap = new Map(departments.map((d) => [d._id, d.name]));

  const designations: DesignationWithDetails[] = rawDesignations.map((d) => ({
    ...d,
    departmentName: deptMap.get(d.departmentId) ?? "—",
  }));

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[
            { label: "Settings", href: "/commandos/settings" },
            { label: "Organization" },
          ]}
          title={<>Designations</>}
          description={<>Job titles and seniority levels for your company&apos;s positions.</>}
        />
        <DesignationsClient designations={designations} departments={departments} />
      </div>
    </div>
  );
}
