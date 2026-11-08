import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { mustSetUpTwoFactor } from "@/lib/security/two-factor";
import { can, requirePlatformAccess } from "@/lib/platform/console/access";
import { ROUTE_PERMISSIONS } from "@/lib/platform/console/permissions";
import { unreadCount } from "@/lib/platform/notifications";
import { countAwaitingApproval } from "@/lib/platform/signup";
import PlatformSidebarShell from "@/components/platform/panel/PlatformSidebarShell";
import PlatformTopbar from "@/components/platform/panel/PlatformTopbar";
import type { PlatformNavFlags } from "@/components/platform/panel/PlatformSidebar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = { title: { default: "Platform Console", template: "%s · Platform Console" }, robots: { index: false, follow: false } };

/**
 * The Platform Console — the single control centre for the SaaS platform
 * (tenants, plans, billing, tax, analytics, platform administration). Same
 * shell as every other product. Platform owner company accounts with a platform role (or legacy Directors) only; on any other
 * company's host it doesn't exist (404). Pages and actions re-check access.
 */
export default async function PlatformPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAccess();
  // Two-step sign-in is asked of Platform Console people like everyone else (they can skip for 72 hours); mandatory only when the operator sets REQUIRE_PRIVILEGED_MFA=1.
  const tfDue = await mustSetUpTwoFactor({ id: user.id, roles: user.roles }, { alwaysPrivileged: true });
  if (tfDue) redirect("/commandos/two-factor-setup");
  const flags: PlatformNavFlags = {
    pendingApprovals: can(user, "signups.read") ? await countAwaitingApproval() : 0,
    unreadNotifications: await unreadCount(user.id).catch(() => 0),
    hidden: Object.entries(ROUTE_PERMISSIONS).flatMap(([href, perm]) => (perm && !can(user, perm) ? [href] : [])),
  };

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <PlatformSidebarShell email={user.email} createdAt={user.createdAt?.toISOString?.()} lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null} flags={flags} />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <PlatformTopbar flags={flags} email={user.email} />
            </div>
            <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-2xl">{children}</main>
          </div>
        </div>
      </SidebarCollapseProvider>
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
