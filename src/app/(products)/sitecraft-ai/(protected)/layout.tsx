import { twoStepGate } from "@/lib/security/two-step-gate";
import { runCmsSweep } from "@/lib/notify/sweeps";
import { panelUnread } from "@/lib/notify";
import { redirect } from "next/navigation";
import { getCurrentCmsUser } from "@/lib/cms-auth";
import { hasCmsAccess } from "@/lib/cms-roles";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import CmsSidebarShell from "@/components/products/sitecraft-ai/CmsSidebarShell";
import CmsTopbar from "@/components/products/sitecraft-ai/CmsTopbar";
import type { CmsNavFlags } from "@/components/products/sitecraft-ai/CmsSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { listPages } from "@/lib/products/sitecraft-ai/pages";
import { getActiveThemeKey } from "@/lib/products/sitecraft-ai/theme";
import { getMaintenanceMode } from "@/lib/products/sitecraft-ai/settings";
import CmsNotices from "@/components/products/sitecraft-ai/CmsNotices";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";

export const generateMetadata = () => brandedMetadata("{brand} {product:cms}", { robots: { index: false, follow: false } });

export default async function ProtectedCmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("cms");
  const user = await getCurrentCmsUser();
  if (!user) redirect("/sitecraft-ai/login");
  if (user.mustChangePassword) redirect("/sitecraft-ai/change-password");
  if (!hasCmsAccess(user.roles)) redirect("/sitecraft-ai/login");
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [pages, maintenance, activeTheme, isOperator] = await Promise.all([listPages(), getMaintenanceMode(), getActiveThemeKey(), isPlatformOwnerContext()]);
  const flags: CmsNavFlags = {
    settings: can(viewer, "SETTINGS_MANAGE"),
    audit: can(viewer, "VIEW_AUDIT"),
    pendingPages: pages.filter((p) => p.hasUnpublishedChanges).length,
    activeTheme,
  };

  await runCmsSweep().catch(() => {});
  return (
    <TooltipProvider delay={200}>
      <ConfirmProvider>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <CmsSidebarShell
            email={user.email}
            roles={user.roles}
            flags={flags}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <CmsTopbar roles={user.roles} flags={flags} aiAgent={!isOperator} unread={await panelUnread(user.id, "cms").catch(() => 0)} />
            </div>
            <PanelBackBar />
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">
              <CmsNotices maintenance={maintenance.enabled} />
              {children}
            </main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
      </ConfirmProvider>
    </TooltipProvider>
  );
}
