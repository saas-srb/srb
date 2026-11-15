import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listDepartmentsWithCounts } from "@/lib/platform/organization";
import DepartmentsClient from "./DepartmentsClient";

export const metadata: Metadata = {
  title: "Departments",
  robots: { index: false, follow: false },
};

export default async function DepartmentsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.departments"); // Director-only item: anyone else sees the locked page inside this shell

  const departments = await listDepartmentsWithCounts();

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[
            { label: "Settings", href: "/commandos/settings" },
            { label: "Organization" },
          ]}
          title={<>Departments</>}
          description={<>Create and manage the departments your company is divided into.</>}
        />
        <DepartmentsClient departments={departments} />
      </div>
    </div>
  );
}
