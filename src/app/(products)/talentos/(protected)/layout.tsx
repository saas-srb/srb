import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import HrmsSidebarShell from "@/components/products/talentos/HrmsSidebarShell";
import HrmsTopbar from "@/components/products/talentos/HrmsTopbar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listNotifications, unreadCount, runNotificationSweep } from "@/lib/products/talentos/notifications";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export default async function ProtectedHrmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("hrms");
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos/login");
  if (user.mustChangePassword) redirect("/talentos/change-password");
  // Role gating happens in the nested (staff) / me layouts — this shell is shared.

  // Throttled internally to once/hour across the app.
  await runNotificationSweep();
  const [notifications, unread] = await Promise.all([
    listNotifications(user, { pageSize: 8 }),
    unreadCount(user),
  ]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <HrmsSidebarShell
            email={user.email}
            roles={user.roles}
            permissionOverrides={user.permissionOverrides}
            employeeId={user.employeeId}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <HrmsTopbar
                roles={user.roles}
                allRoles={user.allRoles}
                permissionOverrides={user.permissionOverrides}
                employeeId={user.employeeId}
                notifications={notifications.items.map((n) => ({
                  _id: n._id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  link: n.link,
                  createdAt: n.createdAt,
                  read: n.read,
                }))}
                unread={unread}
              />
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
