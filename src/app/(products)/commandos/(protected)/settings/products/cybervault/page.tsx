import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SectionCard, Notice } from "@/components/products/cybervault/DlmsUi";
import { AccessManager, DlmsSettingsForm } from "@/components/products/cybervault/SettingsPanels";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getSettings } from "@/lib/products/cybervault/settings";
import { listClientRefs, listDlmsUsers } from "@/lib/products/cybervault/access";
import { isEncryptionConfigured } from "@/lib/products/cybervault/crypto";
import { DLMS_PERMISSIONS, DLMS_PERMISSION_META, DLMS_ROLE_META, DLMS_ROLE_PERMISSIONS } from "@/lib/dlms-roles";
import { LIMITS } from "@/lib/products/cybervault/constants";
import { formatDateTime } from "@/lib/utils";

const ROLES = ["dlms_employee", "dlms_manager", "dlms_admin"] as const;

export default async function CybervaultSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const [settings, users, clients] = await Promise.all([
    getSettings(),
    listDlmsUsers(),
    listClientRefs(),
  ]);
  const encrypted = isEncryptionConfigured();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "CyberVault" },
        ]}
        title={<>CyberVault Settings</>}
        description={<>Alerts, security status and who can open which client vault.</>}
      />

      <SectionCard title="Security" description="How the vault protects what it stores.">
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            {encrypted ? <Check className="size-4 text-emerald-600" /> : <Minus className="size-4 text-rose-600" />}
            Password encryption (AES-256-GCM){encrypted ? " is active" : " is NOT configured — set PLATFORM_ENCRYPTION_KEY"}
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-emerald-600" />
            Passwords are masked by default and re-mask {LIMITS.revealSeconds}s after being shown
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-emerald-600" />
            Every reveal, copy, preview and download is written to the activity log — never the secret itself
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-emerald-600" />
            Documents live in a private store and are served only through this product after a permission check
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Expiry alerts"
        description={settings.updatedAt.getTime() > 0 ? `Last changed ${formatDateTime(settings.updatedAt)}.` : "Using defaults."}
      >
        <DlmsSettingsForm warnDays={settings.warnDays} alertsEnabled={settings.alertsEnabled} />
      </SectionCard>

      <SectionCard
        title="Vault access"
        description="Managers and admins see everything. A CyberVault Employee sees only the clients (and the company vault, if ticked) listed here."
      >
        <AccessManager users={users} clients={clients.map((c) => ({ id: c._id, label: `${c.companyName} (${c.clientCode})` }))} />
      </SectionCard>

      <SectionCard
        title="Role permissions"
        description="Defaults per role. The Director can override individual capabilities per person under Admin → Users."
      >
        <Notice tone="info">Role tiers are assigned in Admin → Users. Scope (which clients) is controlled by “Vault access” above.</Notice>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">{DLMS_ROLE_META[r].label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {DLMS_PERMISSIONS.map((p) => (
                <TableRow key={p}>
                  <TableCell>
                    <p className="text-sm font-medium">{DLMS_PERMISSION_META[p].label}</p>
                    <p className="text-[11px] text-muted-foreground">{DLMS_PERMISSION_META[p].description}</p>
                  </TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      {DLMS_ROLE_PERMISSIONS[r].includes(p) ? (
                        <Check className="mx-auto size-4 text-emerald-600" aria-label="Allowed" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
