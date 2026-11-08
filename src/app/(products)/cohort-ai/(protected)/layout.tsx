import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { hasTmsAccess } from "@/lib/tms-roles";
import TmsSidebarShell from "@/components/products/cohort-ai/TmsSidebarShell";
import TmsTopbar from "@/components/products/cohort-ai/TmsTopbar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listNotifications, unreadCount, runTmsSweep } from "@/lib/products/cohort-ai/notifications";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";

export default async function ProtectedTmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("tms");
  const user = await getCurrentTmsUser();
  if (!user) redirect("/cohort-ai/login");
  if (user.mustChangePassword) redirect("/cohort-ai/change-password");
  if (!hasTmsAccess(user.roles)) redirect("/cohort-ai/login");

  // Throttled internally to once/hour across the app.
  await runTmsSweep();
  const [notifications, unread] = await Promise.all([listNotifications(user.id, 10), unreadCount(user.id)]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <TmsSidebarShell
            email={user.email}
            roles={user.roles}
            permissionOverrides={user.permissionOverrides}
            studentId={user.studentId}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <TmsTopbar
                roles={user.roles}
                allRoles={user.allRoles}
                permissionOverrides={user.permissionOverrides}
                studentId={user.studentId}
                notifications={notifications.map((n) => ({
                  _id: n._id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  link: n.link,
                  createdAt: n.createdAt.toISOString(),
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
