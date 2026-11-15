import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getDb } from "@/lib/mongodb";
import { listDepartments, listTeams } from "@/lib/platform/organization";
import TeamsClient, { type TeamWithDetails } from "./TeamsClient";

export const metadata: Metadata = {
  title: "Teams",
  robots: { index: false, follow: false },
};

export default async function TeamsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.teams"); // Director-only item: anyone else sees the locked page inside this shell

  const [rawTeams, departments, db] = await Promise.all([
    listTeams(),
    listDepartments(),
    getDb(),
  ]);

  const empCounts = await db
    .collection("hrms_employees")
    .aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: "$professional.teamId", count: { $sum: 1 } } },
    ])
    .toArray()
    .catch(() => []);

  const countMap = new Map(empCounts.map((r) => [r._id, r.count]));
  const deptMap = new Map(departments.map((d) => [d._id, d.name]));

  const teams: TeamWithDetails[] = rawTeams.map((t) => ({
    ...t,
    memberCount: countMap.get(t._id) ?? 0,
    departmentName: deptMap.get(t.departmentId) ?? "—",
  }));

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[
            { label: "Settings", href: "/commandos/settings" },
            { label: "Organization" },
          ]}
          title={<>Teams</>}
          description={<>Groups of people within departments working on the same area.</>}
        />
        <TeamsClient teams={teams} departments={departments} />
      </div>
    </div>
  );
}
