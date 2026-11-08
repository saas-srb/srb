import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getDb } from "@/lib/mongodb";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { listWorkflows } from "@/lib/platform/workflows";
import { MAX_WORKFLOWS_PER_COMPANY } from "@/lib/platform/workflows/shared";
import AutomationsManager from "@/components/platform/automations/AutomationsManager";

export const metadata: Metadata = { title: "Automations", robots: { index: false, follow: false } };

export default async function AutomationsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const [workflows, people] = await Promise.all([
    listWorkflows(),
    (await getDb()).collection<{ email: string }>("admin_users").find({}, { projection: { email: 1 } }).sort({ email: 1 }).limit(500).toArray(),
  ]);
  const roles = [{ value: "super_admin", label: "Director" }, ...ROLE_GROUPS.flatMap((g) => g.roles.map((r) => ({ value: r.value, label: `${r.label} · ${g.module}` })))];

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Automations" }]}
          title={<>Automations</>}
          description={<>When something happens in your workspace, notify people, send an email or call a webhook — automatically.</>}
        />
<div className="space-y-4">
        <GlassCard interactive={false}>
          <CardContent>
            <AutomationsManager initial={workflows} roles={roles} people={people.map((p) => ({ id: String(p._id), email: p.email }))} max={MAX_WORKFLOWS_PER_COMPANY} />
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
