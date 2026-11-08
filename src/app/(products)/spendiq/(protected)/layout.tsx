import { twoStepGate } from "@/lib/security/two-step-gate";
import { redirect } from "next/navigation";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsAccess } from "@/lib/prms-roles";
import PrmsSidebarShell from "@/components/products/spendiq/PrmsSidebarShell";
import PrmsTopbar from "@/components/products/spendiq/PrmsTopbar";
import { SidebarCollapseProvider } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { listNotifications, unreadCount, runPrmsSweep } from "@/lib/products/spendiq/notifications";
import { requireModule } from "@/lib/platform/billing/enforce";
import PanelBackBar from "@/components/hub/PanelBackBar";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("{brand} {product:prms}", { robots: { index: false, follow: false } });

export default async function ProtectedPrmsLayout({ children }: { children: React.ReactNode }) {
  await twoStepGate();
  await requireModule("prms");
  const user = await getCurrentPrmsUser();
  if (!user) redirect("/spendiq/login");
  if (user.mustChangePassword) redirect("/spendiq/change-password");
  if (!hasPrmsAccess(user.roles)) redirect("/spendiq/login");

  // Throttled internally to once/hour across the app.
  await runPrmsSweep();
  const [notifications, unread] = await Promise.all([listNotifications(user.id, 10), unreadCount(user.id)]);

  return (
    <TooltipProvider delay={200}>
      <SidebarCollapseProvider>
        <div className="relative flex h-screen gap-3 overflow-hidden bg-canvas p-3">
          <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lms-ambient-mid" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          </div>

          <PrmsSidebarShell
            email={user.email}
            roles={user.roles}
            permissionOverrides={user.permissionOverrides}
            createdAt={user.createdAt.toISOString()}
            lastLoginAt={user.lastLoginAt ? user.lastLoginAt.toISOString() : null}
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="lms-surface relative z-30 shrink-0 rounded-3xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md dark:bg-card/85">
              <PrmsTopbar
                roles={user.roles}
                allRoles={user.allRoles}
                permissionOverrides={user.permissionOverrides}
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
