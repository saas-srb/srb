import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { PORTAL_ROLES, PORTAL_ROLE_META } from "@/lib/portal-roles";
import ImportWizard from "@/components/platform/ImportWizard";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Import data", robots: { index: false, follow: false } };

export default async function ImportSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Import data" }]}
          title={<>Import data</>}
          description={<>Bring leads, clients or employees in from a CSV file with a preview before anything is saved, or take a copy of everything your workspace holds.</>}
        />
<div className="space-y-4">
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle>Take your data with you</CardTitle>
            <CardDescription>
              Every backup of your workspace can be downloaded, and you can make one any time. Backups, restoring them, and deleting your data or your company are on <Link href="/commandos/settings/backups" className="font-semibold text-primary underline-offset-2 hover:underline">Backups &amp; data</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/commandos/settings/backups" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"><Download className="size-4" />Open Backups &amp; data</Link>
          </CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardContent>
            <ImportWizard leadTypes={PORTAL_ROLES.map((r) => ({ value: r, label: PORTAL_ROLE_META[r].label }))} />
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
