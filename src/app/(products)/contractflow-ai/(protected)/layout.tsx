import { twoStepGate } from "@/lib/security/two-step-gate";
import { runLpmsSweep } from "@/lib/notify/sweeps";
import { panelUnread } from "@/lib/notify";
import { redirect } from 'next/navigation';
import { getCurrentLpmsUser } from '@/lib/lpms-auth';
import { hasLpmsAccess, lpmsCan } from '@/lib/lpms-roles';
import { getViewer } from '@/lib/products/contractflow-ai/viewer';
import LpmsSidebarShell from '@/components/products/contractflow-ai/LpmsSidebarShell';
import LpmsTopbar from '@/components/products/contractflow-ai/LpmsTopbar';
import type { LpmsNavFlags } from '@/components/products/contractflow-ai/LpmsSidebar';
import { SidebarCollapseProvider } from '@/components/products/dealflow-ai/SidebarCollapseContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { brandedMetadata } from '@/lib/platform/branding/metadata';
import { requireModule } from '@/lib/platform/billing/enforce';
import PanelBackBar from '@/components/hub/PanelBackBar';
import { getLpmsDashboard } from '@/lib/products/contractflow-ai/analytics';

export const generateMetadata = () => brandedMetadata('{brand} {product:lpms}', { robots: { index: false, follow: false } });

export default async function ProtectedLpmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule('lpms');
  const user = await getCurrentLpmsUser();
  if (!user) redirect('/contractflow-ai/login');
  if (user.mustChangePassword) redirect('/contractflow-ai/change-password');
  if (!hasLpmsAccess(user.roles)) redirect('/contractflow-ai/login');

  const viewer = await getViewer();
  if (!viewer) redirect('/contractflow-ai/login');
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };

  // Count pending approvals for badge
  let pendingApprovals = 0;
  try {
    const dashboard = await getLpmsDashboard(viewer);
    pendingApprovals = dashboard.kpis.pendingApprovals;
  } catch {}

  const flags: LpmsNavFlags = {
    canCreate: lpmsCan(ctx, 'CREATE'),
    canManageTemplates: lpmsCan(ctx, 'MANAGE_TEMPLATES'),
    canManageMakers: lpmsCan(ctx, 'MANAGE_MAKERS'),
    canApprove: lpmsCan(ctx, 'APPROVE'),
    canSign: lpmsCan(ctx, 'SIGN'),
    canViewAudit: lpmsCan(ctx, 'VIEW_AUDIT'),
    canSettings: lpmsCan(ctx, 'MANAGE_POLICIES'),
    pendingApprovals,
  };

  await runLpmsSweep().catch(() => {});
  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="lpms-shell relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient lpms-print-hide pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <LpmsSidebarShell
            email={user.email}
            roles={user.roles}
            flags={flags}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface lpms-print-hide relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <LpmsTopbar roles={user.roles} flags={flags} unread={await panelUnread(user.id, "lpms").catch(() => 0)} />
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
