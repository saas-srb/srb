import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentSopUser } from "@/lib/sop-auth";
import { hasSopAccess, sopCan } from "@/lib/sop-roles";
import { playbookCan } from "@/lib/playbook-roles";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { canViewCompliance } from "@/lib/products/playbook-ai/access";
import { listSopNotifications } from "@/lib/products/playbook-ai/notifications";
import { getAssignedToMe } from "@/lib/products/playbook-ai/analytics";
import SopSidebarShell from "@/components/products/playbook-ai/SopSidebarShell";
import SopTopbar from "@/components/products/playbook-ai/SopTopbar";
import type { SopNavFlags } from "@/components/products/playbook-ai/SopSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export const generateMetadata = () => brandedMetadata("{brand} {product:sop}", { robots: { index: false, follow: false } });

export default async function ProtectedSopLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("sop");
  const user = await getCurrentSopUser();
  if (!user) redirect("/playbook-ai/login");
  if (user.mustChangePassword) redirect("/playbook-ai/change-password");
  if (!hasSopAccess(user.roles)) redirect("/playbook-ai/login");

  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };

  const [bell, assigned] = await Promise.all([listSopNotifications(viewer.userId), getAssignedToMe(viewer)]);
  const flags: SopNavFlags = {
    mySops: sopCan(ctx, "CREATE") || sopCan(ctx, "EDIT"),
    templates: sopCan(ctx, "MANAGE_TEMPLATES") || sopCan(ctx, "CREATE"),
    compliance: canViewCompliance(viewer),
    reports: canViewCompliance(viewer) || sopCan(ctx, "EXPORT"),
    audit: sopCan(ctx, "VIEW_AUDIT"),
    settings: sopCan(ctx, "MANAGE_PERMISSIONS"),
    documents: playbookCan(ctx, "SETTINGS"),
    brand: playbookCan(ctx, "MANAGE_BRAND"),
    create: playbookCan(ctx, "CREATE"),
    templateLibrary: playbookCan(ctx, "CREATE") || playbookCan(ctx, "MANAGE_TEMPLATES"),
    myTemplates: playbookCan(ctx, "MANAGE_TEMPLATES"),
    assignedOpen: assigned.filter((a) => a.state !== "acknowledged").length,
  };

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="sop-shell relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient sop-print-hide pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <SopSidebarShell
            email={user.email}
            roles={user.roles}
            flags={flags}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface sop-print-hide relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <SopTopbar roles={user.roles} flags={flags} notifications={bell.items} unread={bell.unread} />
            </div>
            <PanelBackBar />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">{children}</main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
