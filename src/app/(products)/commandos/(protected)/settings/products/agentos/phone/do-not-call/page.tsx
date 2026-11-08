import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { SectionCard } from "@/components/products/agentos/AibotsUi";
import DoNotCallManager from "@/components/products/agentos/calls/DoNotCallManager";
import PhoneNav from "@/components/products/agentos/calls/PhoneNav";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { listDoNotCall } from "@/lib/products/agentos/calls/dnc";
import { companyTimeZone } from "@/lib/products/agentos/calls/guards";
import { listAibotsStaff } from "@/lib/products/agentos/bots";
import { can, getViewer } from "@/lib/products/agentos/viewer";

export const dynamic = "force-dynamic";

export default async function AgentosDoNotCallPage() {
  await requireWorkspaceAccess("company.products");
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VOICE_CALL_MANAGE")) redirect("/commandos");

  const [entries, timeZone, staff] = await Promise.all([
    listDoNotCall(viewer),
    companyTimeZone(),
    listAibotsStaff(),
  ]);
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "AgentOS", href: "/commandos/settings/products/agentos" },
          { label: "Phone", href: "/commandos/settings/products/agentos/phone" },
          { label: "Do not call" },
        ]}
        title="AgentOS do-not-call list"
        description="Manage numbers that must never be called. Every call, including scheduled calls, is checked against this list."
      />
      <PhoneNav />
      <SectionCard title="Do-not-call list" description={`${entries.length} number${entries.length === 1 ? "" : "s"}. Only the last four digits stay visible.`}>
        <DoNotCallManager entries={entries} timeZone={timeZone} whoAdded={Object.fromEntries(staff.map((s) => [s.value, s.label]))} />
      </SectionCard>
    </div>
  );
}
