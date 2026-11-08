import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getSupportConfig } from "@/lib/support/config";
import SettingsEditor from "./SettingsEditor";

export const metadata: Metadata = { title: "Support settings" };
export const dynamic = "force-dynamic";

export default async function SupportSettingsPage() {
  const user = await requirePlatformPermission("support.read");
  const config = await getSupportConfig();
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Support settings" description="Request types and their form fields, categories, priorities, severities, teams and the status workflow. Changes apply to every company immediately." crumbs={[{ label: "Support" }]} />
      <SettingsEditor initial={config} canManage={can(user, "support.manage")} />
    </div>
  );
}
